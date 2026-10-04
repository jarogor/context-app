/** Общий интерфейс чтения книги по вложению вкладки, не зависящий от формата.
 *
 * Вкладка адресует книгу путём к файлу; рабочее место не знает, откуда книга.
 * Загрузчик определяет формат по расширению файла и обращается к нужной
 * реализации. EPUB — первая реализация; подключение нового формата не меняет
 * рабочую страницу и оболочку.
 */

import { invokeCommand } from '../../../shared/app-bridge';
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

/** Доступ загрузчика к командам приложения. */
export interface ReaderBackend {
  /** Вызов команды приложения. */
  invoke: (command: string, payload: unknown) => Promise<unknown>;
}

/** Формат файла книги по расширению. */
export function formatFromPath(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path.trim());
  return (match?.[1] ?? '').toLowerCase();
}

/** Проверка поддержки формата встроенным чтением. */
export function isSupportedFormat(format: string): boolean {
  return SUPPORTED_FORMATS.includes(format.toLowerCase());
}

/** Загрузка содержимого книги по пути через общий интерфейс чтения. */
export async function loadBookContent(
  path: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<BookContent> {
  const format = formatFromPath(path);
  if (!isSupportedFormat(format)) {
    throw new UnsupportedFormatError(format);
  }
  const response = await backend.invoke('reader_content', { path });
  return normalizeContent(response);
}

/** Открытие файла книги в системном приложении. */
export async function openBookExternally(
  path: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<void> {
  await backend.invoke('reader_open_external', { path });
}

/** Форматы, доступные встроенному чтению: EPUB и форматы плагинов рабочего места. */
export async function supportedFormats(
  backend: ReaderBackend = defaultBackend(),
): Promise<string[]> {
  const formats = new Set<string>(SUPPORTED_FORMATS);
  try {
    const list = (await backend.invoke('reader_formats', {})) as string[] | null;
    for (const format of list ?? []) {
      if (format) {
        formats.add(format.toLowerCase());
      }
    }
  } catch {
    // Плагины рабочего места могут быть недоступны — остаются встроенные форматы.
  }
  return [...formats];
}

/** Выбранный плагин рабочего места для книги. */
export interface WorkplaceSelection {
  /** Идентификатор плагина рабочего места. */
  pluginId: string;
  /** Формат книги, обслуживаемый плагином. */
  format: string;
}

/** Выбор плагина рабочего места по формату файла, если он установлен. */
export async function selectWorkplacePlugin(
  path: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<WorkplaceSelection | null> {
  const format = formatFromPath(path);
  if (!format) {
    return null;
  }
  const pluginId = (await backend.invoke('reader_plugin_for_format', {
    format,
  })) as string | null | undefined;
  if (!pluginId) {
    return null;
  }
  return { pluginId, format };
}

/** Загрузка модуля рисования плагина рабочего места. */
export async function loadWorkplaceViewer(
  pluginId: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<string> {
  return String(await backend.invoke('reader_viewer', { pluginId }));
}

/** Файл модуля рисования: относительный путь и MIME-тип. */
export interface ViewerFile {
  /** Относительный путь файла внутри каталога модуля. */
  path: string;
  /** MIME-тип файла. */
  mime: string;
}

/** Содержимое файла модуля рисования. */
export interface ViewerFileContent extends ViewerFile {
  /** Содержимое файла в base64. */
  base64: string;
}

/** Список файлов модуля рисования плагина рабочего места. */
export async function listWorkplaceViewerFiles(
  pluginId: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<ViewerFile[]> {
  const value = (await backend.invoke('reader_viewer_files', { pluginId })) as unknown;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = (item ?? {}) as { path?: unknown; mime?: unknown };
    return { path: String(record.path ?? ''), mime: String(record.mime ?? '') };
  });
}

/** Чтение содержимого файла модуля рисования. */
export async function readWorkplaceViewerFile(
  pluginId: string,
  path: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<ViewerFileContent> {
  const value = (await backend.invoke('reader_viewer_file', { pluginId, path })) as {
    data?: unknown;
  } | null;
  return { path, mime: '', base64: String(value?.data ?? '') };
}

/** Загрузка точки входа и всех файлов модуля рисования. */
export async function loadWorkplaceBundle(
  pluginId: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<{ entry: string; files: ViewerFileContent[] }> {
  const entry = await loadWorkplaceViewer(pluginId, backend);
  const descriptors = await listWorkplaceViewerFiles(pluginId, backend);
  const files: ViewerFileContent[] = [];
  for (const descriptor of descriptors) {
    const content = await readWorkplaceViewerFile(pluginId, descriptor.path, backend);
    files.push({ path: descriptor.path, mime: descriptor.mime, base64: content.base64 });
  }
  return { entry, files };
}

/** Порция содержимого книги, полученная от ядра. */
interface BookChunk {
  /** Кодированные байты порции. */
  chunk: string;
  /** Смещение конца порции. */
  next: number;
  /** Полный размер книги в байтах. */
  total: number;
  /** Достигнут ли конец файла. */
  done: boolean;
}

/** Чтение содержимого книги частями по пути.
 *
 * Каждая порция приходит отдельной строкой base64 со своим паддингом, поэтому
 * склеивать строки нельзя: граница порции может прийтись на середину тройки
 * байтов, и `atob` на склейке упадёт. Порции декодируются по отдельности, а
 * результат собирается в одну строку base64 для передачи модулю рисования.
 */
export async function readWorkplaceBook(
  path: string,
  backend: ReaderBackend = defaultBackend(),
  onProgress?: (value: number) => void,
): Promise<string> {
  const CHUNK_LENGTH = 512 * 1024;
  let offset = 0;
  let binary = '';
  let total = 0;
  for (;;) {
    const result = (await backend.invoke('reader_book_chunk', {
      path,
      offset,
      length: CHUNK_LENGTH,
    })) as BookChunk;
    binary += atob(result.chunk);
    offset = result.next;
    total = Number(result.total) || binary.length;
    if (total > 0) {
      onProgress?.(Math.max(0, Math.min(100, (offset / total) * 100)));
    }
    if (result.done) {
      break;
    }
  }
  onProgress?.(100);
  return btoa(binary);
}

/** Сброс кэша содержимого книги после переуказания файла. */
export async function forgetBook(
  path: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<void> {
  await backend.invoke('reader_forget_book', { path });
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
  return { invoke: invokeCommand };
}
