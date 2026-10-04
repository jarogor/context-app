/** Клиент базового плагина заметок.
 *
 * Оболочка обращается к заметкам только opaque-операциями `notes.store@1` и не
 * интерпретирует модель хранилища. Модуль чист от Svelte и пригоден для тестов.
 *
 * Заметка — это **цитата**: выделенный в тексте книги фрагмент с непрозрачным
 * якорем, точно восстанавливающим выделение. Книга ведёт несколько именованных
 * наборов заметок; клиент перечисляет их, выбирает активный и управляет
 * наборами, не интерпретируя модель хранилища глубже модели набора.
 */

import { invokeCommand } from '../../shared/app-bridge';
import { parseAnchor, isPageAnchor, type QuoteAnchor } from '../reader/reader/anchor';

/** Идентификатор активной библиотеки в ключе книги. */
const NO_LIBRARY = 'no-library';
/** Имя набора заметок, который книга заводит по умолчанию. */
export const DEFAULT_SET_NAME = 'Основные';

/** Цвет подсветки заметки по умолчанию. */
export const DEFAULT_NOTE_COLOR = 'yellow';

/** Доступные цвета подсветки заметки. */
export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'] as const;

/** Идентификатор цвета подсветки заметки. */
export type NoteColor = (typeof NOTE_COLORS)[number];

/** Русские названия цветов подсветки для интерфейса. */
export const NOTE_COLOR_LABELS: Record<NoteColor, string> = {
    yellow: 'жёлтый',
    green: 'зелёный',
    blue: 'синий',
    pink: 'розовый',
    orange: 'оранжевый',
    purple: 'фиолетовый',
};

/** CSS-значения цветов подсветки для образцов в интерфейсе. */
export const NOTE_COLOR_SWATCHES: Record<NoteColor, string> = {
    yellow: '#fde68a',
    green: '#bbf7d0',
    blue: '#bfdbfe',
    pink: '#fbcfe8',
    orange: '#fed7aa',
    purple: '#ddd6fe',
};

/** Приведение значения к доступному цвету; неизвестное даёт цвет по умолчанию. */
export function normalizeColor(value: unknown): NoteColor {
    const candidate = String(value ?? '').trim();
    return (NOTE_COLORS as readonly string[]).includes(candidate)
        ? (candidate as NoteColor)
        : DEFAULT_NOTE_COLOR;
}

/** Заметка-цитата к книге. */
export interface Note {
    /** Идентификатор заметки. */
    id: string;
    /** Непрозрачный якорь выделения. */
    anchor: string;
    /** Выделенный текст. */
    quote: string;
    /** Метка главы или раздела места в книге. */
    chapter: string;
    /** Цвет подсветки заметки. */
    color: NoteColor;
    /** Доля позиции выделения в книге в процентах. */
    percent: number | null;
    /** Номер страницы для страничных форматов; может отсутствовать. */
    page: number | null;
    /** Время создания (Unix, мс). */
    createdAtMillis: number;
    /** Время последнего изменения (Unix, мс). */
    updatedAtMillis: number;
}

/** Набор заметок книги вместе с заметками. */
export interface NoteSet {
    /** Идентификатор набора. */
    id: string;
    /** Ключ книги, которой принадлежит набор. */
    bookKey: string;
    /** Человекочитаемое имя набора. */
    name: string;
    /** Время создания (Unix, мс). */
    createdAtMillis: number;
    /** Заметки набора. */
    notes: Note[];
}

/** Краткое описание набора в списке. */
export interface NoteSetSummary {
    /** Идентификатор набора. */
    id: string;
    /** Ключ книги. */
    bookKey: string;
    /** Человекочитаемое имя набора. */
    name: string;
    /** Число заметок в наборе. */
    noteCount: number;
}

/** Ключ книги по пути к её файлу (вложению вкладки).
 *
 * Пока нет стабильной идентификации книги (`book-identity`), ключ формирует
 * оболочка. Единый ключ для всех вкладок одной книги сохраняет заметки общими,
 * а рабочее место при этом не знает, откуда книга.
 */
export function bookKey(path: string | null): string {
    const value = (path ?? '').trim();
    return value || NO_LIBRARY;
}

/** Число из значения или значение по умолчанию. */
function toNumber(value: unknown, fallback: number): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

/** Необязательное число: отсутствие и нечисло дают null. */
function toOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

/** Нормализация заметки из ответа плагина. */
export function normalizeNote(value: unknown): Note {
    const record = (value ?? {}) as Record<string, unknown>;
    return {
        id: String(record.id ?? ''),
        anchor: String(record.anchor ?? ''),
        quote: String(record.quote ?? ''),
        chapter: String(record.chapter ?? ''),
        color: normalizeColor(record.color),
        percent: toOptionalNumber(record.percent),
        page: toOptionalNumber(record.page),
        createdAtMillis: toNumber(record.created_at_millis, 0),
        updatedAtMillis: toNumber(record.updated_at_millis, 0),
    };
}

/** Нормализация набора с заметками из ответа плагина. */
export function normalizeSet(value: unknown): NoteSet {
    const record = (value ?? {}) as Record<string, unknown>;
    const notes = Array.isArray(record.notes) ? record.notes.map(normalizeNote) : [];
    return {
        id: String(record.id ?? ''),
        bookKey: String(record.book_key ?? ''),
        name: String(record.name ?? ''),
        createdAtMillis: toNumber(record.created_at_millis, 0),
        notes,
    };
}

/** Нормализация краткого описания набора. */
export function normalizeSetSummary(value: unknown): NoteSetSummary {
    const record = (value ?? {}) as Record<string, unknown>;
    return {
        id: String(record.id ?? ''),
        bookKey: String(record.book_key ?? ''),
        name: String(record.name ?? ''),
        noteCount: toNumber(record.note_count, 0),
    };
}

/** Вызов opaque-операции базового плагина заметок. */
async function operation<T>(action: string, payload: unknown): Promise<T> {
    return (await invokeCommand('invoke_base_plugin_operation', {
        capability: 'notes.store@1',
        operation: action,
        payload,
    })) as T;
}

/** Наборы книги с идентификатором, именем и числом заметок. */
export async function listSets(key: string): Promise<NoteSetSummary[]> {
    return (await loadSets(key)).sets;
}

/** Список наборов книги вместе с сохранённым активным набором.
 *
 * Активный набор хранит сам плагин заметок по ключу книги, поэтому выбор
 * переживает перезапуск приложения. `activeSetId` равен null, если выбор не
 * сохранён или набор исчез.
 */
export async function loadSets(
    key: string,
): Promise<{ sets: NoteSetSummary[]; activeSetId: string | null }> {
    const response = await operation<{ sets?: unknown[]; active_set_id?: unknown }>('list_sets', {
        book_key: key,
    });
    const sets = (response.sets ?? []).map(normalizeSetSummary);
    const activeSetId =
        typeof response.active_set_id === 'string' && response.active_set_id.length > 0
            ? response.active_set_id
            : null;
    return { sets, activeSetId };
}

/** Запоминание активного набора книги в хранилище. */
export async function setActiveSet(key: string, setId: string): Promise<void> {
    await operation('set_active', { book_key: key, set_id: setId });
}

/** Активный набор книги: предпочтительный или первый, иначе null.
 *
 * Предпочтительный набор сохраняется, пока принадлежит книге; иначе активным
 * становится первый набор. Пустой список наборов даёт null — тогда активного
 * набора нет.
 */
export function resolveActiveSetId(
    sets: NoteSetSummary[],
    preferredSetId: string | null,
): string | null {
    if (preferredSetId && sets.some((set) => set.id === preferredSetId)) {
        return preferredSetId;
    }
    return sets.length > 0 ? sets[0].id : null;
}

/** Набор целиком со всеми заметками. */
export async function getSet(setId: string): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('get_set', { set_id: setId });
    return normalizeSet(response.set);
}

/** Создание набора с именем для книги. */
export async function createSet(key: string, name: string): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('create_set', {
        book_key: key,
        name,
    });
    return normalizeSet(response.set);
}

/** Переименование набора: имя непустое, лишние пробелы снимает хранилище. */
export async function renameSet(setId: string, name: string): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('rename_set', {
        set_id: setId,
        name,
    });
    return normalizeSet(response.set);
}

/** Удаление набора вместе с его заметками. */
export async function deleteSet(setId: string): Promise<void> {
    await operation('delete_set', { set_id: setId });
}

/** Набор книги для работы: активный (предпочтительный либо первый), иначе новый по умолчанию. */
export async function ensureDefaultSet(
    key: string,
    preferredSetId: string | null = null,
): Promise<NoteSet> {
    const sets = await listSets(key);
    const activeId = resolveActiveSetId(sets, preferredSetId);
    if (activeId) {
        return getSet(activeId);
    }
    return createSet(key, DEFAULT_SET_NAME);
}

/** Добавление заметки-цитаты в набор книги.
 *
 * Набор задаётся явно: заметка добавляется в активный набор книги, а не в
 * единственный. Цвет подсветки выбирается при создании и по умолчанию жёлтый.
 */
export async function addQuote(
    key: string,
    anchor: QuoteAnchor,
    set: NoteSet,
    color: NoteColor = DEFAULT_NOTE_COLOR,
): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('add_note', {
        book_key: key,
        set_id: set.id,
        note: {
            anchor: JSON.stringify(anchor),
            quote: anchor.quote,
            chapter: String(anchor.chapter),
            color,
            percent: anchor.percent,
            page: anchor.page,
            text: '',
        },
    });
    return normalizeSet(response.set);
}

/** Смена цвета подсветки заметки в наборе книги. */
export async function changeNoteColor(
    key: string,
    setId: string,
    noteId: string,
    color: NoteColor,
): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('update_note', {
        book_key: key,
        set_id: setId,
        note_id: noteId,
        patch: { color },
    });
    return normalizeSet(response.set);
}

/** Удаление заметки из набора книги. */
export async function deleteNote(key: string, setId: string, noteId: string): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('delete_note', {
        book_key: key,
        set_id: setId,
        note_id: noteId,
    });
    return normalizeSet(response.set);
}

/** Имя заметки: начало цитаты либо номер при пустой цитате. */
export function noteName(note: Note, index: number): string {
    const quote = note.quote.trim();
    if (!quote) {
        return `Заметка ${index + 1}`;
    }
    return quote.length > 80 ? `${quote.slice(0, 80)}…` : quote;
}

/** Отображаемое место заметки: страница либо доля позиции. */
export function notePlace(note: Note): string {
    if (note.page !== null) {
        return `Стр. ${note.page}`;
    }
    if (note.percent !== null) {
        return `${note.percent.toFixed(2)} %`;
    }
    return '';
}

/** Заметка-цитата в объёме списка. */
export interface NoteListItem {
    /** Заметка-цитата. */
    note: Note;
    /** Отображаемое имя заметки. */
    name: string;
    /** Отображаемое место заметки. */
    place: string;
    /** Дата создания заметки (Unix, мс). */
    createdAtMillis: number;
}

/** Сравнимое место заметки без якоря: страница, иначе доля позиции в книге. */
function fallbackLocation(note: Note): number {
    if (note.page !== null) {
        return note.page;
    }
    if (note.percent !== null) {
        return note.percent;
    }
    return Number.POSITIVE_INFINITY;
}

/** Сравнение заметок по ходу текста книги, затем по времени создания.
 *
 * Порядок отражает расположение в книге: заметка, созданная позже, но стоящая
 * выше по тексту, идёт раньше. Якорь даёт точную позицию: для текстового якоря —
 * глава и смещение символов, для страничного — номер страницы. Без якоря опорой
 * служат страница или доля позиции.
 */
function byPosition(left: Note, right: Note): number {
    const a = parseAnchor(left.anchor);
    const b = parseAnchor(right.anchor);
    if (a && b) {
        if (isPageAnchor(a) && isPageAnchor(b)) {
            const leftPage = a.page ?? 0;
            const rightPage = b.page ?? 0;
            if (leftPage !== rightPage) {
                return leftPage - rightPage;
            }
        } else if (isPageAnchor(a) || isPageAnchor(b)) {
            // Страничный якорь сопоставим с текстовым лишь по месту книги.
            const difference = fallbackLocation(left) - fallbackLocation(right);
            if (difference !== 0) {
                return difference;
            }
        } else {
            if (a.chapter !== b.chapter) {
                return a.chapter - b.chapter;
            }
            if (a.start !== b.start) {
                return a.start - b.start;
            }
        }
    } else if (a || b) {
        // Заметки без якоря не имеют точного места — показываем их в конце.
        return a ? -1 : 1;
    } else {
        const difference = fallbackLocation(left) - fallbackLocation(right);
        if (difference !== 0) {
            return difference;
        }
    }
    return left.createdAtMillis - right.createdAtMillis;
}

/** Элементы списка заметок-цитат: имя, место и дата.
 *
 * Порядок отражает ход контента (глава и смещение в тексте, иначе страница или
 * доля позиции), а не очерёдность добавления: заметка, созданная позже, но
 * расположенная выше в книге, идёт раньше. Дата остаётся для понимания
 * хронологии.
 */
export function noteList(notes: Note[]): NoteListItem[] {
    return [...notes].sort(byPosition).map((note, index) => ({
        note,
        name: noteName(note, index),
        place: notePlace(note),
        createdAtMillis: note.createdAtMillis,
    }));
}

/** Фильтрация заметок по запросу: цитата и метка места без учёта регистра. */
export function filterNotes(notes: Note[], query: string): Note[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return notes;
    }
    return notes.filter((note) =>
        [note.quote, note.chapter].some((value) => value.toLowerCase().includes(needle)),
    );
}
