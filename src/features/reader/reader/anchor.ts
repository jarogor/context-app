/** Якорь заметки-цитаты: точное место выделения в тексте книги.
 *
 * Якорь адресует выделение не пикселями, а смещениями символов внутри главы,
 * поэтому не зависит от размера окна, переносов строк и масштаба текста.
 * Для страничных форматов (PDF) якорь адресует страницу и прямоугольники
 * выделения в долях размера страницы — тоже независимо от масштаба.
 * Сериализация и разбор — чистые функции; разрешение в диапазон DOM работает с
 * документом книги и вынесено сюда же, чтобы модуль чтения оставался тонким.
 */

/** Версия формата якоря. */
export const ANCHOR_VERSION = 1;

/** Вид якоря выделения. */
export type AnchorKind = 'text' | 'page' | 'point';

/** Прямоугольник выделения в долях размера страницы. */
export interface AnchorRect {
  /** Доля от левого края страницы. */
  x: number;
  /** Доля от верхнего края страницы. */
  y: number;
  /** Доля ширины страницы. */
  width: number;
  /** Доля высоты страницы. */
  height: number;
}

/** Якорь выделения: внутри главы (текст), на странице (страничный) или точке. */
export interface QuoteAnchor {
  /** Версия формата. */
  v: number;
  /** Вид якоря: смещения символов, страница с прямоугольниками или точка. */
  kind: AnchorKind;
  /** Индекс главы книги (0 для якоря страницы и точки). */
  chapter: number;
  /** Смещение начала выделения в символах внутри главы (0 для страницы и точки). */
  start: number;
  /** Смещение конца выделения в символах внутри главы (0 для страницы и точки). */
  end: number;
  /** Выделенный текст. */
  quote: string;
  /** Доля позиции выделения в книге в процентах. */
  percent: number;
  /** Номер страницы для страничных форматов; может отсутствовать. */
  page: number | null;
  /** Прямоугольники выделения в долях страницы (только страничный якорь). */
  rects?: AnchorRect[];
  /** Доля горизонтали точки в книге (только якорь точки). */
  x?: number;
  /** Доля вертикали точки в книге (только якорь точки). */
  y?: number;
}

/** Создание якоря выделения с безопасными значениями. */
export function createAnchor(value: Partial<QuoteAnchor>): QuoteAnchor {
  const kind: AnchorKind =
    value.kind === 'page' ? 'page' : value.kind === 'point' ? 'point' : 'text';
  const anchor: QuoteAnchor = {
    v: ANCHOR_VERSION,
    kind,
    chapter: Number.isFinite(value.chapter) ? Number(value.chapter) : 0,
    start: Number.isFinite(value.start) ? Math.max(0, Number(value.start)) : 0,
    end: Number.isFinite(value.end) ? Math.max(0, Number(value.end)) : 0,
    quote: String(value.quote ?? ''),
    percent: Number.isFinite(value.percent) ? Number(value.percent) : 0,
    page: Number.isFinite(value.page) ? Number(value.page) : null,
  };
  if (kind === 'page') {
    anchor.rects = normalizeRects(value.rects);
  }
  if (kind === 'point') {
    anchor.x = Number.isFinite(value.x) ? Number(value.x) : 0;
    anchor.y = Number.isFinite(value.y) ? Number(value.y) : 0;
  }
  return anchor;
}

/** Создание страничного якоря по странице и прямоугольникам выделения. */
export function createPageAnchor(value: Partial<QuoteAnchor>): QuoteAnchor {
  return createAnchor({ ...value, kind: 'page', chapter: 0, start: 0, end: 0 });
}

/** Создание якоря точки по долям её положения в книге. */
export function createPointAnchor(value: Partial<QuoteAnchor>): QuoteAnchor {
  return createAnchor({ ...value, kind: 'point', start: 0, end: 0 });
}

/** Признак страничного якоря. */
export function isPageAnchor(anchor: QuoteAnchor): boolean {
  return anchor.kind === 'page';
}

/** Признак якоря точки (текстовая карточка или фигура). */
export function isPointAnchor(anchor: QuoteAnchor): boolean {
  return anchor.kind === 'point';
}

/** Нормализация прямоугольников: конечные числа, неотрицательные размеры. */
function normalizeRects(value: unknown): AnchorRect[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rects: AnchorRect[] = [];
  for (const item of value) {
    const record = (item ?? {}) as Record<string, unknown>;
    const x = Number(record.x);
    const y = Number(record.y);
    const width = Number(record.width);
    const height = Number(record.height);
    if (![x, y, width, height].every((number) => Number.isFinite(number))) {
      continue;
    }
    rects.push({ x, y, width: Math.max(0, width), height: Math.max(0, height) });
  }
  return rects;
}

/** Сериализация якоря выделения в непрозрачную строку. */
export function serializeAnchor(anchor: QuoteAnchor): string {
  return JSON.stringify(anchor);
}

/** Разбор непрозрачной строки якоря; повреждённая строка даёт null. */
export function parseAnchor(value: string | null | undefined): QuoteAnchor | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<QuoteAnchor>;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const isPage = parsed.kind === 'page';
    const isPoint = parsed.kind === 'point';
    if (isPoint && (typeof parsed.x !== 'number' || typeof parsed.y !== 'number')) {
      // Якорь точки без координат бессмысленен — считаем повреждённым.
      return null;
    }
    if (
      !isPage &&
      !isPoint &&
      (typeof parsed.chapter !== 'number' || typeof parsed.start !== 'number')
    ) {
      return null;
    }
    return createAnchor(parsed);
  } catch {
    return null;
  }
}

/** Смещение точки диапазона в символах относительно начала главы. */
function offsetWithin(document: Document, root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** Диапазон выделения в смещениях символов внутри главы. */
export interface SelectionOffsets {
  /** Смещение начала выделения. */
  start: number;
  /** Смещение конца выделения. */
  end: number;
}

/** Вычисление смещений выделения внутри главы. */
export function offsetsFromRange(root: Node, range: Range): SelectionOffsets | null {
  const document = root.ownerDocument;
  if (!document || !root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  const start = offsetWithin(document, root, range.startContainer, range.startOffset);
  const end = offsetWithin(document, root, range.endContainer, range.endOffset);
  if (end <= start) {
    return null;
  }
  return { start, end };
}

/** Разрешённое место цитаты в тексте главы. */
export interface ResolvedAnchor {
  /** Диапазон места цитаты. */
  range: Range;
  /** Смещение начала в символах внутри главы. */
  start: number;
  /** Смещение конца в символах внутри главы. */
  end: number;
  /** Найдено ли место по тексту цитаты, а не по сохранённым смещениям. */
  byText: boolean;
}

/** Текст главы для поиска цитаты и признак его свежести. */
interface ChapterText {
  /** Непрерывный текст главы. */
  raw: string;
  /** Длина текста: по ней проверяется, что глава не изменилась. */
  length: number;
}

/** Кэш текста глав: поиск цитаты не пересобирает текст на каждую заметку.
 *
 * Ключ — сам раздел главы, поэтому кэш живёт вместе с документом книги и не
 * удерживает его после смены книги. Подсветка заворачивает текст в `<mark>`, но
 * текста не меняет, поэтому длина остаётся прежней и кэш не пересобирается.
 */
const chapterTextCache = new WeakMap<Element, ChapterText>();

/** Экранирование спецсимволов регулярного выражения. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Шаблон поиска цитаты, устойчивый к пробельным сериям в тексте главы. */
function quotePattern(quote: string): RegExp | null {
  const tokens = quote
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map(escapeRegExp);
  if (tokens.length === 0) {
    return null;
  }
  return new RegExp(tokens.join('\\s+'));
}

/** Непрерывный текст главы (по кэшу, если глава не менялась).
 *
 * Смещения символов этого текста — те же, что у якорей заметок и у поиска по
 * книге, поэтому поиск и подсветка обходятся без повторного обхода документа.
 */
export function chapterTextOf(root: Element): string | null {
  return chapterText(root)?.raw ?? null;
}

/** Текст главы (по кэшу, если глава не менялась). */
function chapterText(root: Element): ChapterText | null {
  const document = root.ownerDocument;
  if (!document) {
    return null;
  }
  const length = root.textContent?.length ?? 0;
  const cached = chapterTextCache.get(root);
  if (cached && cached.length === length) {
    return cached;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let node = walker.nextNode();
  while (node) {
    parts.push(node.nodeValue ?? '');
    node = walker.nextNode();
  }
  const raw = parts.join('');
  const value: ChapterText = { raw, length: raw.length };
  chapterTextCache.set(root, value);
  return value;
}

/** Приведение текста к сравнимому виду: пробельные серии — один пробел. */
function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Поиск места цитаты в тексте главы по самому тексту.
 *
 * Сохранённые смещения перестают совпадать с текстом, если книга разобрана
 * иначе, чем при создании заметки (например, конвертированный TXT попал в
 * EPUB). Тогда заметка не находила диапазон: подсветки не было, а переход к
 * ней промахивался мимо места. Текст цитаты устойчивее смещений, поэтому он
 * служит запасным способом.
 *
 * Поиск идёт по готовому тексту главы из кэша, а не перебором символов: на
 * книге в сотни тысяч символов построчный обход на каждую заметку задерживал
 * открытие рабочего места.
 */
function rangeFromQuote(root: Element, quote: string): ResolvedAnchor | null {
  const pattern = quotePattern(quote);
  if (!pattern) {
    return null;
  }
  const text = chapterText(root);
  if (!text) {
    return null;
  }
  const match = pattern.exec(text.raw);
  if (!match || match[0].length === 0) {
    return null;
  }
  const start = match.index;
  const end = start + match[0].length;
  const range = rangeFromOffsets(root, start, end);
  if (!range) {
    return null;
  }
  return { range, start, end, byText: true };
}

/** Разрешение якоря заметки в диапазон внутри главы.
 *
 * Сначала проверяются сохранённые смещения: если текст под ними совпадает с
 * цитатой, они точны. Иначе место ищется по тексту цитаты — так заметка
 * остаётся рабочей в книге, чья разметка перестала совпадать со смещениями.
 */
export function resolveAnchorRange(root: Element, anchor: QuoteAnchor): ResolvedAnchor | null {
  if (anchor.kind !== 'text') {
    return null;
  }
  const exact = rangeFromOffsets(root, anchor.start, anchor.end);
  const needle = normalizeText(anchor.quote);
  if (exact && !exact.collapsed) {
    const text = normalizeText(exact.toString());
    // Пустой текст под смещениями ничего не подтверждает: он лишь совпал с
    // началом любой цитаты, а не с её местом.
    if (
      text.length > 0 &&
      (text === needle || text.startsWith(needle) || needle.startsWith(text))
    ) {
      return { range: exact, start: anchor.start, end: anchor.end, byText: false };
    }
  }
  return rangeFromQuote(root, anchor.quote);
}

/** Разрешение смещений символов в диапазон DOM внутри главы. */
export function rangeFromOffsets(root: Node, start: number, end: number): Range | null {
  const document = root.ownerDocument;
  if (!document) {
    return null;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let position = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let node = walker.nextNode();
  while (node) {
    const length = node.nodeValue?.length ?? 0;
    if (!startNode && start <= position + length) {
      startNode = node;
      startOffset = start - position;
    }
    if (end <= position + length) {
      endNode = node;
      endOffset = end - position;
      break;
    }
    position += length;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) {
    return null;
  }
  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  } catch {
    return null;
  }
}
