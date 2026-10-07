/** Клиент базового плагина заметок.
 *
 * Оболочка обращается к заметкам только непрозрачными операциями `notes.store@1` и не
 * интерпретирует модель хранилища. Модуль чист от Svelte и пригоден для тестов.
 * Типы и нормализация — в `model.ts`.
 */

import { basePluginOperation } from '../../shared/base-plugin';
import type { QuoteAnchor } from '../reader/reader/anchor';
import {
    DEFAULT_NOTE_COLOR,
    normalizeSet,
    normalizeSetSummary,
    type NoteColor,
    type NoteSet,
    type NoteSetSummary,
    type NoteType,
    type ShapeKind,
} from './model';

/** Вызов непрозрачной операции базового плагина заметок. */
async function operation<T>(action: string, payload: unknown): Promise<T> {
    return basePluginOperation<T>('notes.store@1', action, payload);
}

/** Наборы книги с идентификатором, именем и числом заметок. */
export async function listSets(key: string): Promise<NoteSetSummary[]> {
    return (await loadSets(key)).sets;
}

/** Все наборы всех книг с заметками: агрегат для реестра заметок.
 *
 * Реестр получает наборы одним запросом, без опроса книг по отдельности.
 * Порядок — порядок хранения наборов в хранилище.
 */
export async function listAllSets(): Promise<NoteSet[]> {
    const response = await operation<{ sets?: unknown[] }>('list_all_sets', {});
    return (response.sets ?? []).map(normalizeSet);
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

/** Создание набора с именем для книги.
 *
 * Отображаемое имя книги необязательно: оболочка передаёт человекочитаемое имя
 * открытой книги, чтобы реестр заметок группировал наборы по книге. Ключ книги
 * остаётся непрозрачным и единственным идентификатором связи.
 */
export async function createSet(
    key: string,
    name: string,
    bookTitle = '',
): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('create_set', {
        book_key: key,
        book_title: bookTitle,
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

/** Нормализованное поле заметки для непрозрачной операции добавления. */
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
