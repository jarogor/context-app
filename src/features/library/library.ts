/** Обращения оболочки к каталогу активной библиотеки.
 *
 * Каталог предоставляет активный source-плагин через непрозрачные операции;
 * оболочка не знает устройства каталога и интерпретирует лишь нейтральное
 * представление книг.
 */

import { invokeCommand } from '../../shared/app-bridge';
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

/** Обложка книги из самого файла по абсолютному пути (data URI или `null`).
 *
 * Рабочее место адресует книгу путём и не зависит от открытой библиотеки:
 * обложка извлекается из файла (встроенная в EPUB/FB2 и подобное).
 */
export async function loadFileCover(path: string): Promise<string | null> {
  const value = (await invokeCommand('reader_cover', { path })) as {
    data?: string | null;
    format?: string;
  } | null;
  return coverDataUri(value ?? {});
}

/** Data URI обложки из ответа плагина; `null`, если данных нет. */
function coverDataUri(value: { data?: string | null; format?: string }): string | null {
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

/** Открытие файла книги во внешнем системном приложении. */
export async function openBookExternal(bookId: string): Promise<void> {
  await operation('open_external', { book_id: bookId });
}

/** Форматы, поддерживаемые встроенным чтением. */
export async function readerFormats(): Promise<string[]> {
  const formats = (await invokeCommand('reader_formats', {})) as string[] | null;
  return formats ?? [];
}

/** Корень активной библиотеки (для сборки абсолютного пути книги). */
export async function activeLibraryPath(): Promise<string> {
  const active = (await invokeCommand('active_library', {})) as { path?: string } | null;
  return active?.path ?? '';
}
