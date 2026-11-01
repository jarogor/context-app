/** Реестр заметок: наборы всех книг, поиск и представление для показа.
 *
 * Область реестра получает агрегат всех наборов (`list_all_sets`).
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
    type NoteSet,
    type Note,
    type NoteListItem,
} from '../notes/notes';
import { t } from '@context/i18n';
import { lastSegment } from '../../shared/path';

/** Число заметок словами: «3 заметки», «1 заметка», «3 notes». */
export function noteCountLabel(count: number): string {
    return t('app.note.count', { count });
}

/** Резервное имя книги по ключу: имя файла без расширения.
 *
 * Используется, когда набор не несёт отображаемого имени книги. Ключ при этом
 * остаётся непрозрачным — имя выводится только для показа и не сохраняется.
 */
export function fallbackBookTitle(bookKey: string): string {
    return lastSegment(bookKey, { stripExt: true }) || bookKey;
}

/** Отображаемое имя книги набора: сохранённое имя или резервное по ключу. */
export function bookTitleOf(set: NoteSet): string {
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
    /** Дата создания набора (Unix, мс). */
    createdAtMillis: number;
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
/** Подходит ли заметка под запрос: любое из полей содержит подстроку.
 *
 * Сравнение — по любому вхождению, а не по совпадению целого слова: поиск
 * находит набор и по началу имени.
 */
function noteMatches(note: Note, needle: string): boolean {
    return [note.title, note.comment, note.quote, note.text, note.chapter, notePlace(note)].some(
        (value) => value.toLowerCase().includes(needle),
    );
}

/** Подходит ли набор под запрос: имя набора или имя книги. */
function setMatches(set: NoteSet, needle: string): boolean {
    return (
        set.name.toLowerCase().includes(needle) || bookTitleOf(set).toLowerCase().includes(needle)
    );
}

/** Наборы реестра, готовые к показу, с учётом поиска.
 *
 * Наборы идут по книге (наборы одной книги — подряд, в порядке появления), а
 * внутри — в порядке хранения. Пустой запрос возвращает весь реестр. При
 * совпадении по имени набора или книги набор показывается целиком; иначе — с
 * одними подходящими заметками; без совпадений набор отбрасывается.
 */
export function librarySets(sets: NoteSet[], query: string): LibrarySetView[] {
    const needle = query.trim().toLowerCase();
    const filtered = sets
        .map((set) => {
            if (!needle || setMatches(set, needle)) {
                return set;
            }
            const notes = set.notes.filter((note) => noteMatches(note, needle));
            return notes.length > 0 ? { ...set, notes } : null;
        })
        .filter((set): set is NoteSet => set !== null);

    return filtered.map((set) => ({
        id: set.id,
        bookKey: set.bookKey,
        bookTitle: bookTitleOf(set),
        name: set.name,
        noteItems: noteList(set.notes),
        createdAtMillis: set.createdAtMillis,
        updatedAtMillis: lastUpdatedAt(set.notes),
    }));
}
