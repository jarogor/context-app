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
import { parseAnchor, isPageAnchor, isPointAnchor, type QuoteAnchor } from '../reader/reader/anchor';

/** Идентификатор активной библиотеки в ключе книги. */
const NO_LIBRARY = 'no-library';
/** Имя набора заметок, который книга заводит по умолчанию. */
export const DEFAULT_SET_NAME = 'Основные';

/** Цвет подсветки заметки по умолчанию. */
export const DEFAULT_NOTE_COLOR = 'yellow';

/** Доступные цвета подсветки заметки. */
export const NOTE_COLORS = [
    'yellow',
    'green',
    'blue',
    'red',
    'purple',
    'black',
] as const;

/** Идентификатор цвета подсветки заметки. */
export type NoteColor = (typeof NOTE_COLORS)[number];

/** Русские названия цветов подсветки для интерфейса. */
export const NOTE_COLOR_LABELS: Record<NoteColor, string> = {
    yellow: 'жёлтый',
    green: 'зелёный',
    blue: 'синий',
    red: 'красный',
    purple: 'фиолетовый',
    black: 'чёрный',
};

/** Насыщенные акценты палитры: образцы выбора цвета (панель, меню, список).
 *
 * Один набор на все поверхности выбора: насыщенные базовые цвета, чтобы образец
 * был узнаваем. Для чёрного берётся почти чёрный. Сам вид заметки на странице и
 * её метка в списке берут мягкий тон (`NOTE_COLOR_HIGHLIGHTS`), а не этот акцент.
 */
export const NOTE_COLOR_SWATCHES: Record<NoteColor, string> = {
    yellow: '#eab308',
    green: '#16a34a',
    blue: '#2563eb',
    red: '#dc2626',
    purple: '#9333ea',
    black: '#111827',
};

/** Мягкие тона заметок: фон цитаты, заливка фигуры и карточки, метка списка.
 *
 * Один набор на все типы и поверхности: заметка видна, но не затемняет текст.
 * Тот же тон используется и как цвет карточки, и как метка в списке, поэтому
 * жёлтая заметка выглядит жёлтой одинаково везде — и в книге, и в списке.
 */
export const NOTE_COLOR_HIGHLIGHTS: Record<NoteColor, string> = {
    yellow: '#fde68a',
    green: '#bbf7d0',
    blue: '#bfdbfe',
    red: '#fecaca',
    purple: '#ddd6fe',
    black: '#d1d5db',
};

/** Цвет метки заметки в списке: он совпадает с её видом на странице.
 *
 * Заметка любого типа показывается мягким тоном (подсветка цитаты, заливка
 * фигуры, фон карточки), поэтому и метка в списке мягкая — жёлтая заметка
 * одинакова в списке и в книге.
 */
export function noteMarkerColor(note: Pick<Note, 'type' | 'color'>): string {
    return NOTE_COLOR_HIGHLIGHTS[note.color];
}

/** Тип заметки по умолчанию: цитата. */
export const DEFAULT_NOTE_TYPE = 'quote';

/** Известные типы заметок. */
export const NOTE_TYPES = ['quote', 'text', 'shape'] as const;

/** Тип заметки: цитата, текстовая карточка или фигура. */
export type NoteType = (typeof NOTE_TYPES)[number];

/** Русские названия типов заметок для интерфейса. */
export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
    quote: 'Цитата',
    text: 'Текст',
    shape: 'Фигура',
};

/** Вид фигуры по умолчанию: линия. */
export const DEFAULT_SHAPE_KIND = 'line';

/** Известные виды фигур. */
export const SHAPE_KINDS = ['line', 'rectangle', 'ellipse'] as const;

/** Вид геометрической фигуры. */
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Активный инструмент создания заметок: тип, вид фигуры и цвет. */
export interface NoteTool {
    /** Тип создаваемой заметки. */
    type: NoteType;
    /** Вид фигуры для типа `shape`. */
    shape: ShapeKind;
    /** Цвет создаваемой заметки. */
    color: NoteColor;
}

/** Инструмент заметок по умолчанию: цитата жёлтого цвета. */
export const DEFAULT_NOTE_TOOL: NoteTool = {
    type: DEFAULT_NOTE_TYPE,
    shape: DEFAULT_SHAPE_KIND,
    color: DEFAULT_NOTE_COLOR,
};

/** Типы заметок, доступные **текучему** режиму чтения.
 *
 * Текучий режим — встроенное текстовое чтение разметки (EPUB, позже FB2 и
 * подобные): поток текста перестраивается при смене размера области и масштаба,
 * поэтому точки и геометрия заметок неустойчивы. Здесь надёжна только цитата,
 * привязанная текстовыми смещениями.
 */
export const FLOWING_NOTE_TYPES: readonly NoteType[] = ['quote'];

/** Доступные типы заметок по режиму чтения: страничный — все три, текучий — цитата. */
export function allowedNoteTypes(paged: boolean): readonly NoteType[] {
    return paged ? NOTE_TYPES : FLOWING_NOTE_TYPES;
}

/** Приведение инструмента к доступным типам режима.
 *
 * Если активный тип недоступен (например, при переключении на текучий формат с
 * инструмента «фигура»), инструмент становится цитатой; выбранный цвет и вид
 * фигуры сохраняются.
 */
export function normalizeNoteTool(tool: NoteTool, types: readonly NoteType[]): NoteTool {
    if (types.includes(tool.type)) {
        return tool;
    }
    return { ...tool, type: DEFAULT_NOTE_TYPE };
}

/** Русские названия видов фигур для интерфейса. */
export const SHAPE_KIND_LABELS: Record<ShapeKind, string> = {
    line: 'Линия',
    rectangle: 'Прямоугольник',
    ellipse: 'Эллипс',
};

/** Приведение значения к доступному цвету; неизвестное даёт цвет по умолчанию. */
export function normalizeColor(value: unknown): NoteColor {
    const candidate = String(value ?? '').trim();
    return (NOTE_COLORS as readonly string[]).includes(candidate)
        ? (candidate as NoteColor)
        : DEFAULT_NOTE_COLOR;
}

/** Приведение значения к известному типу; неизвестное даёт цитату. */
export function normalizeType(value: unknown): NoteType {
    const candidate = String(value ?? '').trim();
    return (NOTE_TYPES as readonly string[]).includes(candidate)
        ? (candidate as NoteType)
        : DEFAULT_NOTE_TYPE;
}

/** Приведение значения к известному виду фигуры; неизвестное даёт линию. */
export function normalizeShapeKind(value: unknown): ShapeKind {
    const candidate = String(value ?? '').trim();
    return (SHAPE_KINDS as readonly string[]).includes(candidate)
        ? (candidate as ShapeKind)
        : DEFAULT_SHAPE_KIND;
}

/** Заметка к книге: цитата, текстовая карточка или фигура. */
export interface Note {
    /** Идентификатор заметки. */
    id: string;
    /** Тип заметки. */
    type: NoteType;
    /** Непрозрачный якорь места в книге. */
    anchor: string;
    /** Выделенный текст цитаты. */
    quote: string;
    /** Метка главы или раздела места в книге. */
    chapter: string;
    /** Пользовательское название заметки; пустое, если не задано. */
    title: string;
    /** Пользовательский комментарий к заметке; пустой, если не задан. */
    comment: string;
    /** Цвет подсветки заметки. */
    color: NoteColor;
    /** Доля позиции выделения в книге в процентах. */
    percent: number | null;
    /** Номер страницы для страничных форматов; может отсутствовать. */
    page: number | null;
    /** Текст текстовой карточки. */
    text: string;
    /** Вид фигуры для заметки типа `shape`. */
    shape: ShapeKind;
    /** Непрозрачная геометрия фигуры. */
    geometry: string;
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
        type: normalizeType(record.type),
        anchor: String(record.anchor ?? ''),
        quote: String(record.quote ?? ''),
        chapter: String(record.chapter ?? ''),
        title: String(record.title ?? ''),
        comment: String(record.comment ?? ''),
        color: normalizeColor(record.color),
        percent: toOptionalNumber(record.percent),
        page: toOptionalNumber(record.page),
        text: String(record.text ?? ''),
        shape: normalizeShapeKind(record.shape),
        geometry: String(record.geometry ?? ''),
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
    return addNote(key, set.id, {
        type: 'quote',
        anchor: JSON.stringify(anchor),
        quote: anchor.quote,
        chapter: String(anchor.chapter),
        color,
        percent: anchor.percent,
        page: anchor.page,
    });
}

/** Добавление текстовой карточки в набор книги.
 *
 * Место задаётся непрозрачным якорем точки (`point`). Пустой текст отклоняется.
 */
export async function addTextNote(
    key: string,
    setId: string,
    anchor: QuoteAnchor,
    text: string,
    color: NoteColor = DEFAULT_NOTE_COLOR,
): Promise<NoteSet> {
    return addNote(key, setId, {
        type: 'text',
        anchor: JSON.stringify(anchor),
        quote: '',
        chapter: String(anchor.chapter),
        color,
        percent: anchor.percent,
        page: anchor.page,
        text,
    });
}

/** Добавление фигуры в набор книги.
 *
 * Место и геометрия задаются плагином формата и непрозрачны для ядра. Вид
 * фигуры — линия, прямоугольник или эллипс.
 */
export async function addShapeNote(
    key: string,
    setId: string,
    anchor: QuoteAnchor,
    shape: ShapeKind,
    geometry: string,
    color: NoteColor = DEFAULT_NOTE_COLOR,
): Promise<NoteSet> {
    return addNote(key, setId, {
        type: 'shape',
        anchor: JSON.stringify(anchor),
        quote: '',
        chapter: String(anchor.chapter),
        color,
        percent: anchor.percent,
        page: anchor.page,
        shape,
        geometry,
    });
}

/** Нормализованное поле заметки для opaque-операции добавления. */
interface NotePayload {
    /** Тип заметки. */
    type: NoteType;
    /** Непрозрачный якорь места. */
    anchor: string;
    /** Цитата для заметки-цитаты. */
    quote: string;
    /** Метка главы или раздела. */
    chapter: string;
    /** Пользовательское название заметки. */
    title?: string;
    /** Пользовательский комментарий к заметке. */
    comment?: string;
    /** Цвет подсветки. */
    color: NoteColor;
    /** Доля позиции в книге. */
    percent: number;
    /** Номер страницы; может отсутствовать. */
    page: number | null;
    /** Текст карточки. */
    text?: string;
    /** Вид фигуры. */
    shape?: ShapeKind;
    /** Непрозрачная геометрия фигуры. */
    geometry?: string;
}

/** Добавление заметки любого типа в набор книги через операцию `add_note`. */
async function addNote(key: string, setId: string, note: NotePayload): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('add_note', {
        book_key: key,
        set_id: setId,
        note: { text: '', ...note },
    });
    return normalizeSet(response.set);
}

/** Изменение текста заметки (например, текстовой карточки). */
export async function updateNoteText(
    key: string,
    setId: string,
    noteId: string,
    text: string,
): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('update_note', {
        book_key: key,
        set_id: setId,
        note_id: noteId,
        patch: { text },
    });
    return normalizeSet(response.set);
}

/** Изменение названия и комментария заметки.
 *
 * Поля пользовательские и доступны заметкам всех типов; вызывающая сторона
 * передаёт актуальные значения, а отсутствие поля означает «не менять».
 */
export async function updateNoteDetails(
    key: string,
    setId: string,
    noteId: string,
    details: { title?: string; comment?: string },
): Promise<NoteSet> {
    const patch: Record<string, unknown> = {};
    if (details.title !== undefined) {
        patch.title = details.title;
    }
    if (details.comment !== undefined) {
        patch.comment = details.comment;
    }
    const response = await operation<{ set?: unknown }>('update_note', {
        book_key: key,
        set_id: setId,
        note_id: noteId,
        patch,
    });
    return normalizeSet(response.set);
}

/** Изменение размещения заметки на странице.
 *
 * Перемещение карточки или фигуры меняет непрозрачный якорь места (и геометрию
 * фигуры); сдвиг границ цитаты — тот же якорь с новыми смещениями и текстом.
 * Ядро переносит поля как есть, не интерпретируя модель места.
 */
export async function updateNotePlacement(
    key: string,
    setId: string,
    noteId: string,
    placement: { anchor: string; quote?: string; chapter?: string; percent?: number; geometry?: string },
): Promise<NoteSet> {
    const patch: Record<string, unknown> = { anchor: placement.anchor };
    if (placement.quote !== undefined) {
        patch.quote = placement.quote;
    }
    if (placement.chapter !== undefined) {
        patch.chapter = placement.chapter;
    }
    if (placement.percent !== undefined) {
        patch.percent = placement.percent;
    }
    if (placement.geometry !== undefined) {
        patch.geometry = placement.geometry;
    }
    const response = await operation<{ set?: unknown }>('update_note', {
        book_key: key,
        set_id: setId,
        note_id: noteId,
        patch,
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

/** Имя заметки: пользовательское название, затем содержимое по типу, иначе номер.
 *
 * Название, заданное пользователем, имеет приоритет над содержимым: заметка
 * узнаётся по смыслу, а не по началу цитаты. Без названия имя берётся из цитаты,
 * текста карточки или подписи вида фигуры. Пустое содержимое даёт номер заметки.
 */
export function noteName(note: Note, index: number): string {
    const title = note.title.trim();
    if (title) {
        return title.length > 80 ? `${title.slice(0, 80)}…` : title;
    }
    if (note.type === 'shape') {
        return SHAPE_KIND_LABELS[note.shape];
    }
    const content = (note.type === 'text' ? note.text : note.quote).trim();
    if (!content) {
        return `Заметка ${index + 1}`;
    }
    return content.length > 80 ? `${content.slice(0, 80)}…` : content;
}

/** Содержимое заметки для списка: цитата, текст карточки или вид фигуры.
 *
 * Имя заметки может быть перекрыто пользовательским названием, поэтому
 * содержимое выводится отдельной строкой и позволяет сопоставить запись с
 * фрагментом книги. Для фигуры содержимого нет — показывается её вид.
 */
export function notePreview(note: Note): string {
    if (note.type === 'shape') {
        return '';
    }
    const content = (note.type === 'text' ? note.text : note.quote).trim();
    return content.length > 120 ? `${content.slice(0, 120)}…` : content;
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
    /** Отображаемое имя заметки (название или содержимое). */
    name: string;
    /** Начало содержимого заметки (цитата, текст или вид фигуры). */
    preview: string;
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
 * глава и смещение символов, для страничного — номер страницы, для якоря точки —
 * глава и доля вертикали. Без якоря опорой служат страница или доля позиции.
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
        } else if (isPointAnchor(a) && isPointAnchor(b)) {
            if (a.chapter !== b.chapter) {
                return a.chapter - b.chapter;
            }
            const leftY = a.y ?? 0;
            const rightY = b.y ?? 0;
            if (leftY !== rightY) {
                return leftY - rightY;
            }
        } else if (isPageAnchor(a) || isPageAnchor(b) || isPointAnchor(a) || isPointAnchor(b)) {
            // Якорь страницы или точки сопоставим с прочими лишь по месту книги.
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
        preview: notePreview(note),
        place: notePlace(note),
        createdAtMillis: note.createdAtMillis,
    }));
}

/** Фильтрация заметок по запросу: название, комментарий, цитата, текст и место.
 *
 * Название и комментарий — пользовательский текст, поэтому поиск по ним находит
 * заметку так же, как по её содержимому. Регистр не учитывается.
 */
export function filterNotes(notes: Note[], query: string): Note[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return notes;
    }
    return notes.filter((note) =>
        [note.title, note.comment, note.quote, note.text, note.chapter].some((value) =>
            value.toLowerCase().includes(needle),
        ),
    );
}
