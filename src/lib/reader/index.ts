/** Общий интерфейс чтения книги, не зависящий от формата.
 *
 * Загрузчик определяет формат книги по её файлам и обращается к нужной
 * реализации. EPUB — первая реализация; подключение нового формата не меняет
 * рабочую страницу и оболочку.
 */

import appConfig from '../app-config.json';
import { invokeCommand } from '../app-bridge';
import type { BookChapter, BookContent } from './types';

export type { BookChapter, BookContent } from './types';

/** Форматы, поддерживаемые встроенным чтением. */
const SUPPORTED_FORMATS = ['epub'];

/** Ошибка неподдерживаемого встроенным чтением формата. */
export class UnsupportedFormatError extends Error {
  /** Неподдерживаемый формат книги. */
  readonly format: string;

  constructor(format: string) {
    super(`формат не поддерживается встроенным чтением: ${format || 'неизвестен'}`);
    this.name = 'UnsupportedFormatError';
    this.format = format;
  }
}

/** Доступ загрузчика к командам приложения и служебному хранилищу. */
export interface ReaderBackend {
  /** Вызов команды приложения. */
  invoke: (command: string, payload: unknown) => Promise<unknown>;
  /** Корень служебного хранилища активной библиотеки. */
  storageRoot: string;
}

/** Проверка поддержки формата встроенным чтением. */
export function isSupportedFormat(format: string): boolean {
  return SUPPORTED_FORMATS.includes(format.toLowerCase());
}

/** Загрузка содержимого книги через общий интерфейс чтения. */
export async function loadBookContent(
  bookId: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<BookContent> {
  const format = await bookFormat(bookId, backend);
  if (!isSupportedFormat(format)) {
    throw new UnsupportedFormatError(format);
  }
  const response = await backend.invoke('invoke_plugin_operation', {
    operation: 'content',
    payload: { book_id: bookId },
    storageRoot: backend.storageRoot,
  });
  return normalizeContent(response);
}

/** Открытие файла книги в системном приложении. */
export async function openBookExternally(
  bookId: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<void> {
  await backend.invoke('invoke_plugin_operation', {
    operation: 'open_external',
    payload: { book_id: bookId },
    storageRoot: backend.storageRoot,
  });
}

/** Книга каталога в объёме, нужном для определения формата. */
interface CatalogBook {
  id?: unknown;
  files?: { kind?: string; format?: string }[];
}

/** Определение формата книги по её файлам в каталоге. */
async function bookFormat(bookId: string, backend: ReaderBackend): Promise<string> {
  const response = (await backend.invoke('invoke_plugin_operation', {
    operation: 'list',
    payload: {},
    storageRoot: backend.storageRoot,
  })) as { books?: CatalogBook[]; catalog?: { books?: CatalogBook[] } };
  const books = response.books ?? response.catalog?.books ?? [];
  const book = books.find((item) => String(item.id) === bookId);
  const file = book?.files?.find((item) => item.kind === 'book');
  return (file?.format ?? '').toLowerCase();
}

/** Приведение ответа плагина к модели содержимого. */
function normalizeContent(value: unknown): BookContent {
  const record = (value ?? {}) as {
    title?: unknown;
    authors?: unknown;
    chapters?: unknown;
  };
  const chapters: BookChapter[] = Array.isArray(record.chapters)
    ? record.chapters.map((chapter) => {
        const item = (chapter ?? {}) as { title?: unknown; html?: unknown };
        return {
          title: item.title == null ? null : String(item.title),
          html: String(item.html ?? ''),
        };
      })
    : [];
  return {
    title: String(record.title ?? ''),
    authors: Array.isArray(record.authors) ? record.authors.map(String) : [],
    chapters,
  };
}

/** Загрузчик по умолчанию поверх моста приложения. */
function defaultBackend(): ReaderBackend {
  return { invoke: invokeCommand, storageRoot: appConfig.state_dir };
}
