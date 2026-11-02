/** Встроенные в PDF пометки: разбор аннотаций и показ по запросу.
 *
 * PDF хранит читательские пометки не в тексте, а в аннотациях страницы:
 * выделение (`Highlight`, `Underline`, `Squiggly`, `StrikeOut`) с
 * прямоугольниками и комментарием, текстовый стикер (`Text`) или надпись
 * (`FreeText`). Аннотации не рисуются растром и не входят в текстовый слой,
 * поэтому раньше были невидимы.
 *
 * По умолчанию пометки только разбираются: оболочка получает их список и
 * показывает в свойствах файла. На странице они появляются лишь по запросу
 * пользователя — оболочка присылает идентификаторы для показа.
 */
import type { PdfDocument, PdfPage } from './engine';
import { PAGE_CLASS, overlayOf } from './dom';
import { post } from './protocol';
import { state } from './state';
import type { Rect } from './types';

/** Вид встроенной пометки. */
export type AnnotationKind =
  | 'highlight'
  | 'underline'
  | 'squiggly'
  | 'strikeout'
  | 'note'
  | 'freetext';

/** Аннотация pdf.js в объёме, нужном для разбора. */
interface RawAnnotation {
  /** Подтип аннотации PDF. */
  subtype?: string;
  /** Идентификатор аннотации в документе. */
  id?: string;
  /** Прямоугольник аннотации в координатах страницы. */
  rect?: number[];
  /** Точки выделения (для выделений). */
  quadPoints?: number[];
  /** Комментарий аннотации. */
  contentsObj?: { str?: string };
  /** Богатый текст комментария (запасной вариант). */
  richText?: { str?: string };
  /** Автор пометки. */
  author?: string;
  /** Цвет пометки в RGB 0–255. */
  color?: number[] | Uint8ClampedArray;
  /** Дата изменения. */
  modificationDate?: string;
}

/** Текстовый элемент pdf.js в объёме, нужном для восстановления цитаты. */
interface TextItem {
  /** Текст элемента. */
  str?: string;
  /** Матрица преобразования текста (масштаб по X и Y). */
  transform?: number[];
  /** Ширина элемента в координатах текста. */
  width?: number;
  /** Высота элемента в координатах текста. */
  height?: number;
}

/** Встроенная пометка в общем виде. */
export interface ViewerAnnotation {
  /** Идентификатор аннотации в документе. */
  id: string;
  /** Вид пометки. */
  kind: AnnotationKind;
  /** Страница (1-based). */
  page: number;
  /** Прямоугольники выделения в долях страницы. */
  rects: Rect[];
  /** Выделенный текст. */
  quote: string;
  /** Комментарий автора. */
  comment: string;
  /** Автор пометки. */
  author: string;
  /** Цвет пометки `#rrggbb`. */
  color: string;
  /** Дата изменения. */
  modified: string;
}

/** Подтипы PDF, которые считаются пометками. */
const KINDS: Record<string, AnnotationKind> = {
  Highlight: 'highlight',
  Underline: 'underline',
  Squiggly: 'squiggly',
  StrikeOut: 'strikeout',
  Text: 'note',
  FreeText: 'freetext',
};

/** Идентификаторы пометок, которые сейчас показаны на страницах. */
const shown = new Set<string>();

/** Найденные пометки: страница (1-based) → пометки. */
const byPage = new Map<number, ViewerAnnotation[]>();

/** Подмена найденных пометок: используется разбором и тестами показа. */
export function setAnnotationsForPage(page: number, annotations: ViewerAnnotation[]): void {
  if (annotations.length === 0) {
    byPage.delete(page);
    return;
  }
  byPage.set(page, annotations);
}

/** Признак отмены анализа. */
let stopRequested = false;

/** Сброс состояния при открытии новой книги. */
export function resetAnnotations(): void {
  shown.clear();
  byPage.clear();
  stopRequested = false;
}

/** Цвет аннотации в `#rrggbb`; отсутствие цвета даёт пустую строку. */
function colorOf(value: RawAnnotation['color']): string {
  if (!value || value.length < 3) {
    return '';
  }
  const channels = [value[0], value[1], value[2]].map((channel) =>
    Math.max(0, Math.min(255, Math.round(Number(channel) || 0))),
  );
  return '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('');
}

/** Прямоугольники выделения в долях страницы.
 *
 * `quadPoints` хранятся восьмёрками в координатах страницы (снизу вверх):
 * каждые восемь чисел — один прямоугольник. Без них берётся общий
 * прямоугольник аннотации: у стикеров и надписей он единственный.
 */
export function pageRectsFromQuadPoints(
  quad: number[] | Uint8ClampedArray | undefined,
  width: number,
  height: number,
): Rect[] {
  const result: Rect[] = [];
  if (!quad || width <= 0 || height <= 0) {
    return result;
  }
  const values = Array.from(quad, Number);
  if (values.length < 8) {
    return result;
  }
  for (let index = 0; index + 7 < values.length; index += 8) {
    const xs = [values[index], values[index + 2], values[index + 4], values[index + 6]];
    const ys = [values[index + 1], values[index + 3], values[index + 5], values[index + 7]];
    if (![...xs, ...ys].every((value) => Number.isFinite(value))) {
      continue;
    }
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const rect = {
      x: Math.max(0, Math.min(1, left / width)),
      y: Math.max(0, Math.min(1, 1 - bottom / height)),
      width: Math.max(0, Math.min(1, (right - left) / width)),
      height: Math.max(0, Math.min(1, (bottom - top) / height)),
    };
    if (rect.width > 0 && rect.height > 0) {
      result.push(rect);
    }
  }
  return result;
}

/** Прямоугольники аннотации: из выделения либо общий прямоугольник. */
function annotationRects(
  annotation: RawAnnotation,
  width: number,
  height: number,
): Rect[] {
  const fromQuad = pageRectsFromQuadPoints(annotation.quadPoints, width, height);
  if (fromQuad.length > 0) {
    return fromQuad;
  }
  const rect = annotation.rect;
  if (!Array.isArray(rect) || rect.length < 4 || width <= 0 || height <= 0) {
    return [];
  }
  const [x1, y1, x2, y2] = rect.map(Number);
  if (![x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
    return [];
  }
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const parsed = {
    x: Math.max(0, Math.min(1, left / width)),
    y: Math.max(0, Math.min(1, 1 - bottom / height)),
    width: Math.max(0, Math.min(1, (right - left) / width)),
    height: Math.max(0, Math.min(1, (bottom - top) / height)),
  };
  return parsed.width > 0 && parsed.height > 0 ? [parsed] : [];
}

/** Пересечение двух прямоугольников в долях страницы. */
function intersects(first: Rect, second: Rect): boolean {
  const overlapX =
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const overlapY =
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  return overlapX > 0 && overlapY > 0;
}

/** Текст выделения по прямоугольникам из текстового слоя pdf.js.
 *
 * Выделение хранит только геометрию, а не текст: текст восстанавливается по
 * элементам страницы, попавшим в прямоугольники. Система координат повторяет
 * раскладку pdf.js: `transform` элемента задан в координатах страницы снизу
 * вверх, а прямоугольники пометки — в долях страницы сверху вниз.
 * Без текстового слоя (скан без распознавания) текст остаётся пустым —
 * пометка всё равно показывается.
 */
export function highlightQuoteOf(
  items: TextItem[],
  rects: Rect[],
  pageWidth: number,
  pageHeight: number,
): string {
  if (pageWidth <= 0 || pageHeight <= 0 || rects.length === 0) {
    return '';
  }
  const words: string[] = [];
  for (const item of items) {
    const text = String(item.str ?? '').trim();
    if (!text) {
      continue;
    }
    const transform = (item.transform ?? []).map(Number);
    if (transform.length < 6 || !transform.every((value) => Number.isFinite(value))) {
      continue;
    }
    // Ширина и высота элемента в координатах страницы: pdf.js раскладывает
    // текст в масштабе 1, поэтому матрица даёт их напрямую.
    const itemWidth = Math.abs(Number(item.width) || 0) * Math.abs(transform[0] || 1);
    const fontHeight = Math.hypot(transform[2], transform[3]) || Math.abs(transform[3]) || 0;
    if (itemWidth <= 0 || fontHeight <= 0) {
      continue;
    }
    const left = transform[4];
    const baseline = pageHeight - transform[5];
    const box: Rect = {
      x: Math.max(0, Math.min(1, left / pageWidth)),
      y: Math.max(0, Math.min(1, (baseline - fontHeight) / pageHeight)),
      width: Math.min(1, itemWidth / pageWidth),
      // Строка берётся с запасом по высоте: базовые линии соседних строк
      // стоят на шаге, и выделение идёт по всей строке, как его рисует
      // просмотрщик.
      height: Math.min(1, (fontHeight * 1.35) / pageHeight),
    };
    if (rects.some((area) => intersects(area, box))) {
      words.push(text);
    }
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/** Разбор списка сырых аннотаций страницы.
 *
 * Чистая функция: страница, её размеры и сами аннотации. Выделения без
 * прямоугольников отбрасываются, стикеры и надписи принимаются и без них.
 */
export function annotationsFromRaw(
  raw: RawAnnotation[],
  pageNumber: number,
  width: number,
  height: number,
): ViewerAnnotation[] {
  const result: ViewerAnnotation[] = [];
  for (const annotation of raw) {
    const subtype = String(annotation.subtype ?? '');
    const kind = KINDS[subtype];
    if (!kind) {
      continue;
    }
    const id = String(annotation.id ?? '').trim();
    if (!id) {
      continue;
    }
    const rects = annotationRects(annotation, width, height);
    const isText = kind === 'note' || kind === 'freetext';
    if (rects.length === 0 && !isText) {
      continue;
    }
    const comment = String(
      annotation.contentsObj?.str ?? annotation.richText?.str ?? '',
    ).trim();
    result.push({
      id,
      kind,
      page: pageNumber,
      rects,
      quote: '',
      comment,
      author: String(annotation.author ?? '').trim(),
      color: colorOf(annotation.color),
      modified: String(annotation.modificationDate ?? ''),
    });
  }
  return result;
}

/** Разбор аннотаций одной страницы. */
async function parsePage(page: PdfPage, pageNumber: number): Promise<ViewerAnnotation[]> {
  const base = page.getViewport({ scale: 1 });
  let raw: RawAnnotation[] = [];
  try {
    raw = (await page.getAnnotations({ intent: 'display' })) as RawAnnotation[];
  } catch {
    return [];
  }
  return annotationsFromRaw(raw, pageNumber, base.width, base.height);
}

/** Восстановление текста выделений страницы по её текстовому слою. */
async function fillQuotes(page: PdfPage, annotations: ViewerAnnotation[]): Promise<void> {
  const highlighted = annotations.filter(
    (annotation) => annotation.rects.length > 0 && isTextLayerAnnotation(annotation.kind),
  );
  if (highlighted.length === 0) {
    return;
  }
  let items: TextItem[] = [];
  try {
    const content = await page.getTextContent();
    items = content.items as TextItem[];
  } catch {
    return;
  }
  const base = page.getViewport({ scale: 1 });
  for (const annotation of highlighted) {
    annotation.quote = highlightQuoteOf(items, annotation.rects, base.width, base.height);
  }
}

/** Анализ встроенных пометок книги.
 *
 * Страницы читаются порциями и отдаются приложению по ходу разбора, чтобы
 * список в панели наполнялся сразу. Повреждённая страница не прерывает анализ
 * остальных.
 */
export async function analyzeAnnotations(): Promise<void> {
  const doc: PdfDocument | null = state.doc;
  if (!doc) {
    return;
  }
  stopRequested = false;
  byPage.clear();
  const total = state.pageCount;
  let processed = 0;
  post({
    type: 'file-annotations',
    value: { reset: true, done: false, annotations: [], processed: 0, total, error: '' },
  });
  const batchSize = 8;
  for (let pageNumber = 1; pageNumber <= total; pageNumber += batchSize) {
    if (stopRequested) {
      return;
    }
    const pages: number[] = [];
    for (let offset = 0; offset < batchSize && pageNumber + offset <= total; offset += 1) {
      pages.push(pageNumber + offset);
    }
    const found: ViewerAnnotation[] = [];
    for (const current of pages) {
      if (stopRequested) {
        return;
      }
      try {
        const page = await doc.getPage(current);
        const annotations = await parsePage(page, current);
        await fillQuotes(page, annotations);
        if (annotations.length > 0) {
          byPage.set(current, annotations);
          found.push(...annotations);
        }
      } catch {
        // Повреждённая страница не прерывает анализ остальных.
      }
      processed += 1;
    }
    post({
      type: 'file-annotations',
      value: {
        reset: false,
        done: false,
        annotations: found,
        processed,
        total,
        error: '',
      },
    });
    // Между порциями управление отдаётся браузеру: чтение не ждёт разбора.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  post({
    type: 'file-annotations',
    value: { reset: false, done: true, annotations: [], processed, total, error: '' },
  });
}

/** Остановка анализа встроенных пометок. */
export function stopAnnotations(): void {
  stopRequested = true;
}

/** Показ выбранных пометок на страницах и снятие остальных. */
export function showAnnotations(ids: string[]): void {
  shown.clear();
  for (const id of ids) {
    shown.add(id);
  }
  drawVisibleAnnotations();
}

/** Отрисовка показанных пометок страницы поверх растра.
 *
 * Выделения рисуются полосами по строкам, как заметки-цитаты, но своим
 * классом: это не заметка пользователя, а пометка файла, и её нельзя двигать.
 * Стикеры и надписи показываются рамкой в месте аннотации.
 */
export function drawAnnotations(pageEl: HTMLElement): void {
  const overlay = overlayOf(pageEl);
  if (!overlay) {
    return;
  }
  for (const stale of Array.from(
    overlay.querySelectorAll('[data-file-annotation="true"]'),
  )) {
    stale.remove();
  }
  const pageNumber = Number(pageEl.dataset.page);
  const annotations = byPage.get(pageNumber) ?? [];
  for (const annotation of annotations) {
    if (!shown.has(annotation.id)) {
      continue;
    }
    for (const rect of annotation.rects) {
      const element = document.createElement('div');
      element.className = FILE_ANNOTATION_CLASS;
      element.dataset.fileAnnotation = 'true';
      element.dataset.annotationId = annotation.id;
      element.dataset.kind = annotation.kind;
      element.style.left = rect.x * 100 + '%';
      element.style.top = rect.y * 100 + '%';
      element.style.width = rect.width * 100 + '%';
      element.style.height = rect.height * 100 + '%';
      if (annotation.color) {
        element.style.setProperty('--file-annotation-color', annotation.color);
      }
      overlay.appendChild(element);
    }
  }
}

/** Перерисовка показанных пометок на отрисованных страницах. */
export function drawVisibleAnnotations(): void {
  for (const pageEl of Array.from(document.querySelectorAll(`.${PAGE_CLASS}`))) {
    drawAnnotations(pageEl as HTMLElement);
  }
}

/** Пометки книги: страница (1-based) → пометки. */
export function annotationsByPage(): ReadonlyMap<number, ViewerAnnotation[]> {
  return byPage;
}

/** Признак того, что пометка относится к классу выделений. */
export function isTextLayerAnnotation(kind: AnnotationKind): boolean {
  return (
    kind === 'highlight' ||
    kind === 'underline' ||
    kind === 'squiggly' ||
    kind === 'strikeout'
  );
}

/** Класс полосы встроенной пометки (совпадает с оформлением). */
export const FILE_ANNOTATION_CLASS = 'file-annotation';
