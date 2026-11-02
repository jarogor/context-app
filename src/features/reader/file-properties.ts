/** Свойства открытого файла для панели «Свойства файла».
 *
 * Модуль чист от Svelte: описывает данные, которые области чтения передают
 * оболочке, и приводит их из непрозрачных сообщений плагинов. Панель показывает
 * содержание книги, встроенные закладки, превью страниц и найденные в файле
 * пометки; сами данные принадлежат формату, оболочка их только отображает.
 */

/** Встроенная закладка файла (PDF outline, DjVu NAVM). */
export interface FileBookmark {
  /** Название пункта. */
  title: string;
  /** Страница перехода (1-based) или `null`, если цель не определена. */
  page: number | null;
  /** Вложенные пункты в порядке документа. */
  children: FileBookmark[];
}

/** Вид встроенной в PDF пометки. */
export type FileAnnotationKind =
  | 'highlight'
  | 'underline'
  | 'squiggly'
  | 'strikeout'
  | 'note'
  | 'freetext';

/** Прямоугольник пометки в долях размера страницы. */
export interface FileAnnotationRect {
  /** Доля от левого края. */
  x: number;
  /** Доля от верхнего края. */
  y: number;
  /** Доля ширины страницы. */
  width: number;
  /** Доля высоты страницы. */
  height: number;
}

/** Встроенная в файл пометка: выделение с комментарием или текстовая заметка. */
export interface FileAnnotation {
  /** Устойчивый идентификатор пометки в документе. */
  id: string;
  /** Вид пометки. */
  kind: FileAnnotationKind;
  /** Страница (1-based). */
  page: number;
  /** Прямоугольники выделения в долях страницы. */
  rects: FileAnnotationRect[];
  /** Выделенный текст (может быть пустым, если текстовый слой недоступен). */
  quote: string;
  /** Комментарий автора пометки; пустой, если не задан. */
  comment: string;
  /** Автор пометки; пустой, если не задан. */
  author: string;
  /** Цвет пометки в виде `#rrggbb`; пустой, если цвет не задан. */
  color: string;
  /** Дата изменения в исходной записи PDF; пустая, если не задана. */
  modified: string;
}

/** Порция найденных в файле пометок, присланная плагином. */
export interface FileAnnotationBatch {
  /** Признак начала нового анализа: прежние результаты сбрасываются. */
  reset: boolean;
  /** Анализ завершён. */
  done: boolean;
  /** Найденные пометки в этой порции. */
  annotations: FileAnnotation[];
  /** Сколько страниц уже разобрано. */
  processed: number;
  /** Всего страниц в файле или `null`, если неизвестно. */
  total: number | null;
  /** Ошибка анализа; пустая, если ошибки нет. */
  error: string;
}

/** Глава текучей книги в содержании. */
export interface FileChapter {
  /** Индекс главы в содержимом книги. */
  index: number;
  /** Заголовок главы для списка. */
  title: string;
}

/** Снимок свойств открытого файла. */
export interface FilePropertiesSnapshot {
  /** Формат книги по расширению файла. */
  format: string;
  /** Читается ли книга встроенным текучим чтением. */
  flowing: boolean;
  /** Главы книги для текучего чтения. */
  chapters: FileChapter[];
  /** Встроенные закладки файла. */
  bookmarks: FileBookmark[];
  /** Число страниц страничного формата или `null`. */
  pageCount: number | null;
  /** Умеет ли модуль рисования показывать превью страниц. */
  thumbnails: boolean;
  /** Есть ли в файле встроенные пометки (формат умеет их разбирать). */
  annotationsSupported: boolean;
  /** Найденные пометки. */
  annotations: FileAnnotation[];
  /** Миниатюры страниц: номер страницы → картинка `data:`-URL. */
  thumbs: Record<number, string>;
  /** Анализ пометок завершён. */
  annotationsDone: boolean;
  /** Ошибка анализа пометок; пустая, если ошибки нет. */
  annotationsError: string;
  /** Сколько страниц уже разобрано при анализе пометок. */
  annotationsProcessed: number;
  /** Всего страниц для анализа пометок или `null`. */
  annotationsTotal: number | null;
  /** Умеет ли модуль читать встроенные закладки файла. */
  bookmarksSupported: boolean;
  /** Пометки пришли из кэша целиком: повторный разбор не нужен. */
  annotationsCached: boolean;
}

/** Вкладка панели свойств файла. */
export type PropertiesTabId = 'contents' | 'bookmarks' | 'pages' | 'annotations';

/** Пустой снимок свойств для книги, которая ещё не открыта. */
export function emptyProperties(format = ''): FilePropertiesSnapshot {
  return {
    format,
    flowing: false,
    chapters: [],
    bookmarks: [],
    pageCount: null,
    thumbnails: false,
    annotationsSupported: false,
    annotations: [],
    thumbs: {},
    annotationsDone: false,
    annotationsError: '',
    annotationsProcessed: 0,
    annotationsTotal: null,
    bookmarksSupported: false,
    annotationsCached: false,
  };
}

/** Приведение неотрицательного числа; отсутствие и нечисло дают `null`. */
function optionalCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
}

/** Приведение закладки из сообщения плагина. */
function normalizeBookmark(value: unknown): FileBookmark | null {
  const record = (value ?? {}) as {
    title?: unknown;
    page?: unknown;
    children?: unknown;
  };
  const page = optionalCount(record.page);
  const children = Array.isArray(record.children)
    ? record.children
        .map((child) => normalizeBookmark(child))
        .filter((child): child is FileBookmark => child !== null)
    : [];
  const title = String(record.title ?? '').trim();
  if (!title && page === null && children.length === 0) {
    return null;
  }
  return { title, page: page && page > 0 ? page : null, children };
}

/** Приведение дерева закладок из сообщения плагина. */
export function normalizeBookmarks(value: unknown): FileBookmark[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeBookmark(item))
    .filter((item): item is FileBookmark => item !== null);
}

/** Виды пометок, которые оболочка умеет показывать. */
const ANNOTATION_KINDS: readonly string[] = [
  'highlight',
  'underline',
  'squiggly',
  'strikeout',
  'note',
  'freetext',
];

/** Приведение прямоугольника пометки. */
function normalizeRect(value: unknown): FileAnnotationRect | null {
  const record = (value ?? {}) as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (![x, y, width, height].every((number) => Number.isFinite(number))) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.min(1, width),
    height: Math.min(1, height),
  };
}

/** Приведение встроенной пометки из сообщения плагина. */
function normalizeAnnotation(value: unknown): FileAnnotation | null {
  const record = (value ?? {}) as Record<string, unknown>;
  const id = String(record.id ?? '').trim();
  const kind = String(record.kind ?? '').trim();
  const page = optionalCount(record.page);
  if (!id || !ANNOTATION_KINDS.includes(kind) || page === null || page < 1) {
    return null;
  }
  const rects = Array.isArray(record.rects)
    ? record.rects
        .map((rect) => normalizeRect(rect))
        .filter((rect): rect is FileAnnotationRect => rect !== null)
    : [];
  return {
    id,
    kind: kind as FileAnnotationKind,
    page,
    rects,
    quote: String(record.quote ?? ''),
    comment: String(record.comment ?? ''),
    author: String(record.author ?? ''),
    color: String(record.color ?? ''),
    modified: String(record.modified ?? ''),
  };
}

/** Разбор порции пометок из сообщения плагина. */
export function parseFileAnnotationBatch(value: unknown): FileAnnotationBatch {
  const record = (value ?? {}) as Record<string, unknown>;
  const annotations = Array.isArray(record.annotations)
    ? record.annotations
        .map((item) => normalizeAnnotation(item))
        .filter((item): item is FileAnnotation => item !== null)
    : [];
  return {
    reset: record.reset === true,
    done: record.done === true,
    annotations,
    processed: Math.max(0, optionalCount(record.processed) ?? 0),
    total: optionalCount(record.total),
    error: String(record.error ?? ''),
  };
}

/** Слияние порции пометок с уже найденными: повторы по идентификатору отбрасываются. */
export function mergeFileAnnotations(
  current: FileAnnotation[],
  batch: FileAnnotationBatch,
): FileAnnotation[] {
  const base = batch.reset ? [] : current;
  const seen = new Set(base.map((annotation) => annotation.id));
  const result = [...base];
  for (const annotation of batch.annotations) {
    if (seen.has(annotation.id)) {
      continue;
    }
    seen.add(annotation.id);
    result.push(annotation);
  }
  return result;
}

/** Доступные вкладки панели свойств для снимка. */
export function propertyTabs(snapshot: FilePropertiesSnapshot): PropertiesTabId[] {
  const tabs: PropertiesTabId[] = [];
  if (snapshot.chapters.length > 0) {
    tabs.push('contents');
  }
  if (!snapshot.flowing && snapshot.bookmarksSupported) {
    tabs.push('bookmarks');
  }
  if (snapshot.thumbnails && (snapshot.pageCount ?? 0) > 0) {
    tabs.push('pages');
  }
  if (snapshot.annotationsSupported) {
    tabs.push('annotations');
  }
  return tabs;
}
