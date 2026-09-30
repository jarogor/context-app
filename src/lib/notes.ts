/** Клиент базового плагина заметок.
 *
 * Оболочка обращается к заметкам только opaque-операциями `notes.store@1` и не
 * интерпретирует модель хранилища. Модуль чист от Svelte и пригоден для тестов.
 *
 * Заметка — это **цитата**: выделенный в тексте книги фрагмент с непрозрачным
 * якорем, точно восстанавливающим выделение. Книга заводит один набор заметок
 * по умолчанию, поэтому клиент скрывает наборы от панели.
 */

import { invokeCommand } from './app-bridge';
import type { QuoteAnchor } from './reader/anchor';

/** Идентификатор активной библиотеки в ключе книги. */
const NO_LIBRARY = 'no-library';
/** Имя набора заметок, который книга заводит по умолчанию. */
export const DEFAULT_SET_NAME = 'Основные';

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
    const response = await operation<{ sets?: unknown[] }>('list_sets', { book_key: key });
    return (response.sets ?? []).map(normalizeSetSummary);
}

/** Первый набор книги либо null, если наборов ещё нет. */
export async function findSet(key: string): Promise<NoteSet | null> {
    const sets = await listSets(key);
    return sets.length > 0 ? getSet(sets[0].id) : null;
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

/** Использует первый набор книги, иначе заводит набор по умолчанию. */
export async function ensureDefaultSet(key: string): Promise<NoteSet> {
    const sets = await listSets(key);
    if (sets.length > 0) {
        return getSet(sets[0].id);
    }
    return createSet(key, DEFAULT_SET_NAME);
}

/** Добавление заметки-цитаты в набор книги.
 *
 * Набор определяется по ключу книги: панель работает с единственным набором
 * книги, поэтому идентификатор набора не требуется.
 */
export async function addQuote(key: string, anchor: QuoteAnchor, set: NoteSet): Promise<NoteSet> {
    const response = await operation<{ set?: unknown }>('add_note', {
        book_key: key,
        set_id: set.id,
        note: {
            anchor: JSON.stringify(anchor),
            quote: anchor.quote,
            chapter: String(anchor.chapter),
            percent: anchor.percent,
            page: anchor.page,
            text: '',
        },
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

/** Элементы списка заметок-цитат: имя, место и дата. */
export function noteList(notes: Note[]): NoteListItem[] {
    return notes.map((note, index) => ({
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
