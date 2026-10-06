/** Реестр заметок: наборы всех книг, поиск и представление для показа.
 *
 * Поверхность реестра получает агрегат всех наборов (`list_all_sets`).
 * **Заметки — первичны, книга — подпись:** пользователь приходит в реестр за
 * заметками, поэтому основное здесь — заметки и их наборы, а книга — компактный
 * контекст под именем набора (её имя берётся из сохранённого `book_title`, а для
 * старых наборов — резервно из ключа).
 *
 * Ключ книги непрозрачен: модуль группирует по его значению и не разбирает его
 * как путь, кроме резервного отображаемого имени. Это задел под будущую
 * устойчивую идентификацию книги (`book-identity`): смена источника ключа не
 * потребует правки реестра.
 */

import {
    noteList,
    notePlace,
    type AggregateNoteSet,
    type Note,
    type NoteListItem,
} from '../notes/notes';

/** Склонение числа заметок: 1 заметка, 2 заметки, 5 заметок. */
export function pluralNotes(count: number): string {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
        return 'заметка';
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return 'заметки';
    }
    return 'заметок';
}

/** Число заметок словами: «3 заметки», «1 заметка». */
export function noteCountLabel(count: number): string {
    return `${count} ${pluralNotes(count)}`;
}

/** Резервное имя книги по ключу: имя файла без расширения.
 *
 * Используется, когда набор не несёт отображаемого имени книги. Ключ при этом
 * остаётся непрозрачным — имя выводится только для показа и не сохраняется.
 */
export function fallbackBookTitle(bookKey: string): string {
    const segments = bookKey.split(/[\\/]/).filter(Boolean);
    const last = segments.length > 0 ? segments[segments.length - 1] : bookKey;
    return last.replace(/\.[^.]+$/, '') || bookKey;
}

/** Отображаемое имя книги набора: сохранённое имя или резервное по ключу. */
export function bookTitleOf(set: AggregateNoteSet): string {
    const title = set.bookTitle.trim();
    return title || fallbackBookTitle(set.bookKey);
}

/** Набор реестра, готовый к показу: книга-подпись, имя и заметки. */
export interface LibrarySetView {
    /** Идентификатор набора. */
    id: string;
    /** Непрозрачный ключ книги набора. */
    bookKey: string;
    /** Отображаемое имя книги (сохранённое или резервное). */
    bookTitle: string;
    /** Человекочитаемое имя набора. */
    name: string;
    /** Заметки набора для показа (в порядке хода текста). */
    noteItems: NoteListItem[];
    /** Дата последнего изменения набора (Unix, мс); 0, если заметок нет. */
    updatedAtMillis: number;
}

/** Дата последнего изменения набора по времени правки его заметок. */
function lastUpdatedAt(notes: Note[]): number {
    return notes.reduce(
        (latest, note) => Math.max(latest, note.updatedAtMillis || note.createdAtMillis),
        0,
    );
}

/** Совпадает ли заметка с запросом: название, комментарий, цитата, текст, место. */
function noteMatches(note: Note, needle: string): boolean {
    return [note.title, note.comment, note.quote, note.text, note.chapter, notePlace(note)].some(
        (value) => value.toLowerCase().includes(needle),
    );
}

/** Подходит ли набор под запрос: имя набора или имя книги. */
function setMatches(set: AggregateNoteSet, needle: string): boolean {
    return (
        set.name.toLowerCase().includes(needle) ||
        bookTitleOf(set).toLowerCase().includes(needle)
    );
}

/** Наборы реестра, готовые к показу, с учётом поиска.
 *
 * Наборы идут по книге (наборы одной книги — подряд, в порядке появления), а
 * внутри — в порядке хранения. Пустой запрос возвращает весь реестр. При
 * совпадении по имени набора или книги набор показывается целиком; иначе — с
 * одними подходящими заметками; без совпадений набор отбрасывается.
 */
export function librarySets(sets: AggregateNoteSet[], query: string): LibrarySetView[] {
    const needle = query.trim().toLowerCase();
    const filtered = sets
        .map((set) => {
            if (!needle || setMatches(set, needle)) {
                return set;
            }
            const notes = set.notes.filter((note) => noteMatches(note, needle));
            return notes.length > 0 ? { ...set, notes } : null;
        })
        .filter((set): set is AggregateNoteSet => set !== null);

    return filtered.map((set) => ({
        id: set.id,
        bookKey: set.bookKey,
        bookTitle: bookTitleOf(set),
        name: set.name,
        noteItems: noteList(set.notes),
        updatedAtMillis: lastUpdatedAt(set.notes),
    }));
}
