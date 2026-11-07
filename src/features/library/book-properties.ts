/** Пользовательские свойства книг: правки и теги поверх источника.
 *
 * Свойства книги добывает источник, а правки и пользовательские теги
 * принадлежат приложению и переживают пересборку индекса. Ключ записи —
 * абсолютный путь книги, как у заметок и кэша обложек.
 */

import { invokeCommand } from '../../shared/app-bridge';
import type { Book } from './library';

/** Правка свойств одной книги; отсутствующее поле берётся из источника. */
export interface BookPropertyEntry {
  /** Название, заданное пользователем. */
  title?: string;
  /** Авторы, заданные пользователем. */
  authors?: string[];
  /** Язык книги. */
  language?: string;
  /** Дата выхода. */
  published?: string;
  /** Издатель. */
  publisher?: string;
  /** Идентификатор издания. */
  identifier?: string;
  /** Пользовательские теги книги. */
  tags?: string[];
  /** Когда правка сделана (Unix, мс). */
  updatedAtMillis?: number;
}

/** Правки по абсолютному пути книги. */
export type BookPropertyMap = Record<string, BookPropertyEntry>;

/** Ответ ядра по одной правке (поля JSON в `snake_case`). */
interface RawEntry {
  /** Название. */
  title?: unknown;
  /** Авторы. */
  authors?: unknown;
  /** Язык. */
  language?: unknown;
  /** Дата выхода. */
  published?: unknown;
  /** Издатель. */
  publisher?: unknown;
  /** Идентификатор издания. */
  identifier?: unknown;
  /** Пользовательские теги. */
  tags?: unknown;
  /** Время правки. */
  updated_at_millis?: unknown;
}

/** Непустая строка из необязательного поля ответа ядра. */
function text(value: unknown): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : undefined;
}

/** Список непустых строк из необязательного поля ответа ядра. */
function textList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const list = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

/** Разбор ответа ядра в карту правок. */
function normalizeProperties(response: Record<string, RawEntry> | null): BookPropertyMap {
  const result: BookPropertyMap = {};
  for (const [path, raw] of Object.entries(response ?? {})) {
    const entry: BookPropertyEntry = {
      title: text(raw.title),
      authors: textList(raw.authors),
      language: text(raw.language),
      published: text(raw.published),
      publisher: text(raw.publisher),
      identifier: text(raw.identifier),
      tags: textList(raw.tags),
      updatedAtMillis:
        typeof raw.updated_at_millis === 'number' ? raw.updated_at_millis : undefined,
    };
    // Запись без содержимого эквивалентна её отсутствию.
    if (
      entry.title ||
      entry.authors ||
      entry.language ||
      entry.published ||
      entry.publisher ||
      entry.identifier ||
      entry.tags
    ) {
      result[path] = entry;
    }
  }
  return result;
}

/** Чтение правок всех книг. */
export async function loadBookProperties(): Promise<BookPropertyMap> {
  const response = (await invokeCommand('book_properties_get', {})) as Record<
    string,
    RawEntry
  > | null;
  return normalizeProperties(response);
}

/** Запись правки книги; пустая правка удаляет запись. */
export async function saveBookProperties(
  path: string,
  entry: BookPropertyEntry,
): Promise<BookPropertyMap> {
  const response = (await invokeCommand('book_properties_set', {
    path,
    properties: entry,
  })) as Record<string, RawEntry> | null;
  return normalizeProperties(response);
}

/** Наложение правок на книги каталога: правка перекрывает свойство файла. */
export function applyBookProperties<T extends Book>(
  books: T[],
  properties: BookPropertyMap,
  pathOf: (book: T) => string,
): T[] {
  return books.map((book) => {
    const entry = properties[pathOf(book)];
    if (!entry) {
      return book;
    }
    const merged = {
      ...book,
      title: entry.title ?? book.title,
      authors: entry.authors?.length ? entry.authors.map((name) => ({ name })) : book.authors,
      language: entry.language ?? book.language,
      published: entry.published ?? book.published,
      publisher: entry.publisher ?? book.publisher,
      identifier: entry.identifier ?? book.identifier,
      // Теги у книги одни: правка заменяет теги файла целиком.
      tags: entry.tags ? entry.tags.map((name) => ({ name })) : book.tags,
    };
    return merged as T;
  });
}
