/** Импорт и экспорт наборов заметок.
 *
 * Файл набора — переносимый документ, формат которого принадлежит плагину
 * заметок: оболочка не разбирает его и не собирает. При экспорте плагин отдаёт
 * готовый текст и имя файла, а оболочка сохраняет их по выбору пользователя;
 * при импорте оболочка передаёт путь выбранного файла, а читает и разбирает его
 * сам плагин. Так владелец данных остаётся один.
 *
 * **Книга не переносится путём.** В файле книга описана (имя файла и название):
 * один и тот же файл может лежать по разным путям, а набор принадлежит книге.
 * Локальную книгу выбирает пользователь при импорте, и набор привязывается к её
 * пути в этом хранилище.
 */

import { invokeCommand, openDialog } from '../../shared/app-bridge';
import { basePluginOperation } from '../../shared/base-plugin';
import { readableBookExtensions } from '../library/library';
import { normalizeSet, type NoteSet } from './model';

/** Расширения файлов набора заметок. */
const FILE_EXTENSIONS = ['json'];

/** Документ экспорта, подготовленный плагином заметок. */
interface ExportDocument {
  /** Предлагаемое имя файла. */
  file_name?: string;
  /** Текст документа в переносимом формате. */
  document?: string;
}

/** Описание книги в файле набора: имя файла и название, без места хранения. */
export interface BookDescription {
  /** Имя файла книги. */
  name: string;
  /** Отображаемое название книги. */
  title: string;
}

/** Разобранный, но ещё не принятый набор: файл и описание книги. */
export interface NoteSetImport {
  /** Файл набора, выбранный пользователем. */
  path: string;
  /** Имя набора из файла. */
  name: string;
  /** Число заметок из файла. */
  noteCount: number;
  /** Книга, к которой набор относится по файлу. */
  book: BookDescription;
}

/** Книга этого хранилища, к которой принимается набор. */
export interface ImportTargetBook {
  /** Локальный ключ книги — путь её файла. */
  key: string;
  /** Отображаемое название книги; пустое — берётся из файла. */
  title: string;
}

/** Экспорт набора заметок в файл.
 *
 * Возвращается путь записанного файла; `null` — пользователь закрыл диалог, не
 * выбрав место. Содержимое файла готовит плагин: оболочка лишь сохраняет текст.
 * `bookName` — имя файла книги, по нему набор найдёт книгу на другой стороне.
 */
export async function exportNoteSet(setId: string, bookName: string): Promise<string | null> {
  const response = await basePluginOperation<ExportDocument>('notes.store@1', 'export_set', {
    set_id: setId,
    book_name: bookName,
  });
  const fileName = response.file_name?.trim() || 'notes.json';
  const content = response.document ?? '';
  // Аргументы команды передаются в camelCase: так Tauri сопоставляет их с
  // полями Rust-команды (`fileName` → `file_name`).
  return (await invokeCommand('save_text_file', { fileName, content })) as string | null;
}

/** Выбор файла набора и чтение его описания.
 *
 * Возвращается описание набора и книги; `null` — файл не выбран. Состояние
 * заметок не меняется: набор принимается отдельным шагом.
 */
export async function prepareNoteSetImport(): Promise<NoteSetImport | null> {
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: 'JSON', extensions: FILE_EXTENSIONS }],
  });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (typeof path !== 'string' || !path) {
    return null;
  }
  const response = await basePluginOperation<{
    set?: { name?: unknown; note_count?: unknown };
    book?: { name?: unknown; title?: unknown };
  }>('notes.store@1', 'inspect_import', { path });
  return {
    path,
    name: String(response.set?.name ?? ''),
    noteCount: Number(response.set?.note_count ?? 0),
    book: {
      name: String(response.book?.name ?? ''),
      title: String(response.book?.title ?? ''),
    },
  };
}

/** Выбор файла книги, которой нет в библиотеке.
 *
 * Доступны только форматы, которые приложение умеет читать: книга, открытая
 * произвольным файлом, — такая же книга, как из библиотеки. `null` — файл не
 * выбран.
 */
export async function pickBookFile(): Promise<ImportTargetBook | null> {
  const extensions = await readableBookExtensions();
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: 'Книги', extensions }],
  });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (typeof path !== 'string' || !path) {
    return null;
  }
  return { key: path, title: '' };
}

/** Принятие подготовленного набора.
 *
 * Набор принимается **всегда**: если книгу не выбрали, он попадает в реестр без
 * книги и привязывается позже. Идентификаторы выдаёт плагин заново, поэтому один
 * файл можно принять несколько раз. Появление набора объявляет событие
 * `notes:changed`.
 */
export async function completeNoteSetImport(
  pending: NoteSetImport,
  book: ImportTargetBook | null = null,
): Promise<NoteSet> {
  const response = await basePluginOperation<{ set?: unknown }>('notes.store@1', 'import_set', {
    path: pending.path,
    book_key: book?.key ?? '',
    book_title: book?.title ?? '',
  });
  return normalizeSet(response.set);
}

/** Привязка существующего набора к книге.
 *
 * Набор мог быть принят без книги; привязать его можно в любой момент — к книге
 * из библиотеки или к файлу разрешённого формата. Заметки не меняются.
 */
export async function bindNoteSetBook(setId: string, book: ImportTargetBook): Promise<NoteSet> {
  const response = await basePluginOperation<{ set?: unknown }>('notes.store@1', 'bind_set', {
    set_id: setId,
    book_key: book.key,
    book_title: book.title,
  });
  return normalizeSet(response.set);
}
