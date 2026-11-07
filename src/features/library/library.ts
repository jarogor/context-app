/** Обращения оболочки к каталогу активной библиотеки.
 *
 * Каталог предоставляет активный source-плагин через непрозрачные операции;
 * оболочка не знает устройства каталога и интерпретирует лишь нейтральное
 * представление книг.
 */

import { invokeCommand } from '../../shared/app-bridge';
import { lastSegment } from '../../shared/path';
import appConfig from './app-config.json';

/** Файл книги в каталоге источника. */
export interface BookFile {
  /** Назначение файла. */
  kind: 'book' | 'cover';
  /** Путь файла относительно корня библиотеки. */
  path: string;
  /** Формат файла. */
  format: string;
}

/** Книга каталога источника. */
export interface Book {
  /** Идентификатор книги в каталоге. */
  id: string;
  /** Название. */
  title: string;
  /** Авторы. */
  authors: { name: string }[];
  /** Серии. */
  series: { series: { name: string } }[];
  /** Теги. */
  tags: { name: string }[];
  /** Файлы книги. */
  files: BookFile[];
}

/** Книга с извлечённой обложкой (data URI). */
export type BookWithCover = Book & { coverUri?: string };

/** Книг на странице списка библиотеки.
 *
 * Каталог источника отдаётся целиком, поэтому постраничность — это показ части
 * списка: сетка книг не рисует тысячи карточек сразу, а листается страницами.
 */
export const LIBRARY_PAGE_SIZE = 60;

/** Формат файла книги и его поддержка чтением. */
export interface BookFormatInfo {
  /** Формат файла в нижнем регистре. */
  format: string;
  /** Открывается ли формат чтением приложения. */
  readable: boolean;
}

/** Вызов непрозрачной операции активного source-плагина сессии. */
async function operation<T>(action: string, payload: unknown = {}): Promise<T> {
  return (await invokeCommand('invoke_plugin_operation', {
    operation: action,
    payload,
    storageRoot: appConfig.state_dir,
  })) as T;
}

/** Преобразование нейтральной записи книги в модель оболочки. */
function normalizeBook(book: Record<string, unknown>): Book {
  const id = String(book.id ?? '');
  const authors = Array.isArray(book.authors)
    ? book.authors.map((author) => ({ name: String(author) }))
    : [];
  const files = Array.isArray(book.files)
    ? book.files.map((file) => {
        const value = file as Record<string, unknown>;
        return {
          kind: value.kind === 'cover' ? 'cover' : 'book',
          path: String(value.path ?? ''),
          format: String(value.format ?? ''),
        } satisfies BookFile;
      })
    : [];
  const series = Array.isArray(book.series)
    ? book.series.map((entry) => ({ series: { name: String(entry) } }))
    : [];
  const tags = Array.isArray(book.tags) ? book.tags.map((tag) => ({ name: String(tag) })) : [];
  return {
    id,
    title: String(book.title ?? ''),
    authors,
    series,
    tags,
    files,
  };
}

/** Загрузка списка книг: полного или отфильтрованного запросом. */
export async function listBooks(query: string): Promise<Book[]> {
  type Response = {
    catalog?: { books?: Record<string, unknown>[] };
    books?: Record<string, unknown>[];
  };
  const response = query.trim()
    ? await operation<Response>('search', { query })
    : await operation<Response>('list');
  const rawBooks = response.books ?? response.catalog?.books ?? [];
  return rawBooks.map(normalizeBook);
}

/** Извлечение обложки книги как data URI (или `null`, если её нет). */
export async function loadCover(bookId: string): Promise<string | null> {
  const value = await operation<{ data?: string | null; format?: string }>('cover', {
    book_id: bookId,
  });
  return coverDataUri(value);
}

/** Data URI обложки из ответа плагина; `null`, если данных нет. */
export function coverDataUri(value: { data?: string | null; format?: string }): string | null {
  if (!value.data) {
    return null;
  }
  const mime =
    value.format === 'png'
      ? 'image/png'
      : value.format === 'webp'
        ? 'image/webp'
        : value.format === 'gif'
          ? 'image/gif'
          : 'image/jpeg';
  return `data:${mime};base64,${value.data}`;
}

/** Открытие конкретного файла книги.
 *
 * Книга с несколькими форматами открывается тем файлом, который выбрал
 * пользователь, а не первым файлом записи каталога.
 */
export async function openBookFile(path: string): Promise<void> {
  await invokeCommand('reader_open_external', { path });
}

/** Форматы, поддерживаемые встроенным чтением. */
export async function readerFormats(): Promise<string[]> {
  const formats = (await invokeCommand('reader_formats', {})) as string[] | null;
  return formats ?? [];
}

/** Расширения файлов книг, которые приложение умеет читать.
 *
 * Список берётся у ядра: он складывается из форматов, которые обслуживают
 * плагины чтения. Книга, открытая произвольным файлом, — такая же книга, что и
 * из библиотеки, поэтому выбор книги для набора ограничен этим списком.
 */
export async function readableBookExtensions(): Promise<string[]> {
  const formats = (await readerFormats())
    .map((format) => format.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
  return formats.length > 0 ? formats : ['epub', 'fb2'];
}

/** Корень активной библиотеки (для сборки абсолютного пути книги). */
export async function activeLibraryPath(): Promise<string> {
  const active = (await invokeCommand('active_library', {})) as { path?: string } | null;
  return active?.path ?? '';
}

/** Абсолютный путь файла книги по корню библиотеки и относительному пути.
 *
 * Относительный путь уже абсолютный (книга открыта извне библиотеки) — он
 * возвращается как есть: источник может отдавать и такие записи.
 */
export function absoluteBookPath(root: string, relative: string): string {
  const value = relative.trim();
  if (!value) {
    return '';
  }
  if (/^([a-z]+:)?[\\/]/i.test(value)) {
    return value;
  }
  if (!root) {
    return value;
  }
  return `${root.replace(/[\\/]+$/, '')}/${value}`;
}

/** Книга активной библиотеки для выбора: место хранения и подписи.
 *
 * Ключ книги — абсолютный путь её файла содержимого: так книга открывается и так
 * к ней привязываются заметки. Он вычисляется здесь, чтобы диалоги выбора книги
 * не собирали путь по-своему.
 */
export interface BookChoice {
  /** Локальный ключ книги (абсолютный путь файла содержимого). */
  key: string;
  /** Имя файла книги с расширением. */
  name: string;
  /** Отображаемое название книги. */
  title: string;
}

/** Книги активной библиотеки для выбора. */
export async function bookChoices(): Promise<BookChoice[]> {
  const [root, books] = await Promise.all([activeLibraryPath(), listBooks('')]);
  return books.flatMap((book) => {
    const file = book.files.find((entry) => entry.kind === 'book');
    if (!file) {
      return [];
    }
    const key = absoluteBookPath(root, file.path);
    if (!key) {
      return [];
    }
    return [{ key, name: lastSegment(file.path, { stripExt: false }), title: book.title }];
  });
}
