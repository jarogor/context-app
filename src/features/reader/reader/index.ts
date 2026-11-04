/** Общий интерфейс чтения книги по вложению вкладки, не зависящий от формата.
 *
 * Вкладка адресует книгу путём к файлу; рабочее место не знает, откуда книга.
 * Читатель выбирается по плагину формата: каждый формат обслуживает свой
 * плагин, а встроенного чтения отдельных форматов в оболочке нет.
 */

import { invokeCommand } from '../../../shared/app-bridge';

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

/** Открытие внешней ссылки книги системным приложением. */
export async function openBookLink(
  href: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<void> {
  await backend.invoke('reader_open_link', { href });
}

/** Открытие файла книги. */
export async function openBookFile(
  path: string,
  backend: ReaderBackend = defaultBackend(),
): Promise<void> {
  await backend.invoke('reader_open_external', { path });
}

/** Выбранный плагин рабочего места для книги. */
export interface WorkplaceSelection {
  /** Идентификатор плагина рабочего места. */
  pluginId: string;
  /** Формат книги, обслуживаемый плагином. */
  format: string;
  /** Текучая ли книга: плагин объявляет это в манифесте. */
  flowing: boolean;
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
  const value = (await backend.invoke('reader_plugin_for_format', { format })) as
    | { plugin_id?: unknown; flowing?: unknown }
    | string
    | null
    | undefined;
  if (!value) {
    return null;
  }
  // Ответ ядра — плагин и признак текучести; строка поддерживается для
  // совместимости с прежним ответом «только идентификатор».
  if (typeof value === 'string') {
    return { pluginId: value, format, flowing: false };
  }
  const pluginId = String(value.plugin_id ?? '');
  if (!pluginId) {
    return null;
  }
  return { pluginId, format, flowing: value.flowing === true };
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

/** Размер порции книги в байтах: 1 МиБ, выровненный по base64.
 *
 * Прежние 512 КиБ на книге в сотни мегабайт означали сотни вызовов моста:
 * открытие книги упиралось в обмен между ядром и интерфейсом, а не в чтение
 * файла. Порция крупнее даёт вдвое меньше вызовов и меньше работы на сборку.
 *
 * Кратность трём обязательна: base64 кодирует по три байта, и порция длиной не
 * кратной трём даёт в конце строки паддинг `=`. Такой паддинг нельзя склеивать
 * со следующей порцией — получится невалидная строка. При кратной длине
 * промежуточные порции выходят без паддинга, и содержимое собирается простой
 * склейкой строк: ни декодировать, ни кодировать в интерфейсе не нужно.
 */
const BOOK_CHUNK_BYTES = 1_048_575;

/** Чтение содержимого книги частями по пути.
 *
 * Порции уже закодированы в base64 и выровнены по его границе (см.
 * `BOOK_CHUNK_BYTES`), поэтому содержимое собирается склейкой строк. Работа
 * главного потока — только сам вызов моста и конкатенация: декодирование и
 * повторное кодирование книги здесь не выполняются.
 */
export async function readWorkplaceBook(
  path: string,
  backend: ReaderBackend = defaultBackend(),
  onProgress?: (value: number) => void,
): Promise<string> {
  const parts: string[] = [];
  let offset = 0;
  let total = 0;
  for (;;) {
    const result = (await backend.invoke('reader_book_chunk', {
      path,
      offset,
      length: BOOK_CHUNK_BYTES,
    })) as BookChunk;
    parts.push(result.chunk);
    offset = result.next;
    total = Number(result.total) || offset;
    if (total > 0) {
      onProgress?.(Math.max(0, Math.min(100, (offset / total) * 100)));
    }
    if (result.done) {
      break;
    }
  }
  onProgress?.(100);
  return parts.join('');
}

/** Глава книги: заголовок и внутренний HTML с изображениями в `data:`-URI. */
export interface BookChapter {
  /** Заголовок главы, если он найден при разборе. */
  title?: string | null;
  /** Внутренний HTML главы. */
  html: string;
}

/** Содержимое книги, не зависящее от конкретного формата. */
export interface BookContent {
  /** Название книги. */
  title: string;
  /** Авторы книги. */
  authors: string[];
  /** Упорядоченные главы книги. */
  chapters: BookChapter[];
}

/** Разбор ответа плагина формата в модель содержимого. */
function normalizeContent(value: unknown): BookContent {
  const record = (value ?? {}) as { title?: unknown; authors?: unknown; chapters?: unknown };
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

/** Кодирование текста в base64 для передачи модулю рисования. */
export function encodeText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Загрузка содержимого книги: разбор выполняет плагин её формата.
 *
 * Ядро отдаёт главы плагина как opaque-модель, поэтому оболочка лишь приводит
 * ответ к общему виду содержимого.
 */
export async function readBookContent(
  path: string,
  onProgress?: (value: number) => void,
  backend: ReaderBackend = defaultBackend(),
): Promise<BookContent> {
  onProgress?.(0);
  const response = await backend.invoke('reader_content', { path });
  onProgress?.(100);
  return normalizeContent(response);
}

/** Загрузчик по умолчанию поверх моста приложения. */
function defaultBackend(): ReaderBackend {
  return { invoke: invokeCommand };
}
