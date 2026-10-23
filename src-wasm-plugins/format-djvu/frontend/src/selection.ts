/** Живое выделение текста: полосы, заливка и метки на странице.
 *
 * Нативное выделение браузера прозрачно и служит копированию; видимое выделение
 * рисует собственный слой: полосы строк и вертикальные метки у краёв всего
 * выделения. Заливка — единый элемент, обрезанный маской по сырым
 * прямоугольникам диапазона, поэтому на стыках строк она не темнеет.
 */
import { SELECTION_LAYER_CLASS, elementOf, overlayOf, TEXT_LAYER_CLASS } from './dom';
import { tileByLine } from './lines';
import type { Rect } from './types';

/** Прямоугольник в долях страницы, заданный рамкой. */
export function fractionRect(bounds: DOMRect, pageBounds: DOMRect): Rect {
  return {
    x: (bounds.left - pageBounds.left) / pageBounds.width,
    y: (bounds.top - pageBounds.top) / pageBounds.height,
    width: bounds.width / pageBounds.width,
    height: bounds.height / pageBounds.height,
  };
}

/** Прямоугольники выделения в долях страницы.
 *
 * За основу берутся боксы span'ов текстового слоя, а не `range.getClientRects()`.
 * Прямоугольник диапазона — это инлайновый бокс шрифта: он выше и смещён
 * относительно заданных `top`/`height` слова (у системного шрифта разница
 * доходит до нескольких пикселей). Полоса, построенная по нему, идёт не по
 * видимым буквам. Бокс span'а задаётся по чернилам растра (см.
 * `alignTextLayerToRaster`), поэтому совпадает с буквами, — и полоса тоже.
 */
export function selectionRects(range: Range, pageBounds: DOMRect): Rect[] {
  const rects: Rect[] = [];
  const pitch = pagePitch(range);
  for (const bounds of spanRects(range)) {
    if (bounds.width <= 0 || bounds.height <= 0) {
      continue;
    }
    // Вертикаль полосы — по межстрочному шагу страницы (см. `tileByLine`): так
    // одиночное слово и блок выделяются одинаково, полосой на высоту строки.
    if (pitch > 0) {
      const center = bounds.top + bounds.height / 2;
      rects.push({
        x: (bounds.left - pageBounds.left) / pageBounds.width,
        y: (center - pitch / 2 - pageBounds.top) / pageBounds.height,
        width: bounds.width / pageBounds.width,
        height: pitch / pageBounds.height,
      });
      continue;
    }
    rects.push(fractionRect(bounds, pageBounds));
  }
  return rects;
}

/** Межстрочный шаг страницы выделения в CSS-пикселях; 0 — шаг неизвестен. */
function pagePitch(range: Range): number {
  const startLayer = elementOf(range.startContainer)?.closest<HTMLElement>(`.${TEXT_LAYER_CLASS}`);
  const value = startLayer ? Number.parseFloat(startLayer.dataset.linePitch ?? '') : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Прямоугольники выделения по боксам span'ов.
 *
 * Диапазон может начинаться и заканчиваться в середине слова: тогда берётся
 * доля ширины бокса пропорционально длине вошедшего текста. Высота и вертикаль
 * всегда от бокса span'а — именно они совпадают с видимыми буквами.
 */
function spanRects(range: Range): DOMRect[] {
  const out: DOMRect[] = [];
  const collect = (node: Node): void => {
    const element = node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
    const span = element ? element.closest<HTMLElement>('.textLayer span') : null;
    if (!span || !span.firstChild) {
      // Текст вне спанов (например, пробелы между ними) даёт обычные боксы.
      out.push(...Array.from(range.getClientRects()));
      return;
    }
    const own = span.getBoundingClientRect();
    const text = span.firstChild as Text;
    // Хвостовой пробел зоны — не буква: он нужен только для непрерывности
    // выделения и копирования. Если делить ширину по полной длине текста,
    // двойной клик по слову (диапазон без пробела) даёт рамку короче слова на
    // долю пробела — тем заметнее, чем слово короче. Ширина делится только
    // между буквами.
    const length = text.data.replace(/\s+$/, '').length;
    if (!(length > 0) || !(own.width > 0)) {
      return;
    }
    // Доля слова, вошедшая в диапазон.
    let from = 0;
    let to = length;
    const startInside = range.startContainer === text;
    const endInside = range.endContainer === text;
    if (startInside) {
      from = Math.max(0, Math.min(length, range.startOffset));
    }
    if (endInside) {
      to = Math.max(0, Math.min(length, range.endOffset));
    }
    if (!startInside && !endInside) {
      from = 0;
      to = length;
    }
    if (to <= from) {
      return;
    }
    const left = own.left + (own.width * from) / length;
    const right = own.left + (own.width * to) / length;
    out.push(new DOMRect(left, own.top, Math.max(0, right - left), own.height));
  };
  // Узлы, затронутые диапазоном.
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  const nodes: Node[] = [];
  let current: Node | null = walker.currentNode;
  while (current) {
    if (range.intersectsNode(current)) {
      nodes.push(current);
    }
    current = walker.nextNode();
  }
  for (const node of nodes) {
    collect(node);
  }
  if (out.length === 0) {
    out.push(...Array.from(range.getClientRects()));
  }
  return out;
}

/**
 * Маска заливки выделения: единый `clipPath` по прямоугольникам диапазона.
 *
 * Перекрывающиеся части строк объединяются одним контуром с правилом `nonzero`,
 * поэтому заливка на стыках не темнеет, а полоса не сужается до середины букв.
 * SVG лежит внутри заливаемого элемента, а `clipPath` задан в долях его рамки
 * (`objectBoundingBox`) — то есть в долях страницы.
 */
export function applyFillMask(fill: HTMLElement, rects: Rect[], clipId: number): string {
  const namespace = 'http://www.w3.org/2000/svg';
  const id = 'selection-clip-' + clipId;
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  const clip = document.createElementNS(namespace, 'clipPath');
  clip.setAttribute('id', id);
  clip.setAttribute('clipPathUnits', 'objectBoundingBox');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute(
    'd',
    rects
      .map((rect) => `M${rect.x} ${rect.y}h${rect.width}v${rect.height}h-${rect.width}Z`)
      .join(' '),
  );
  clip.append(path);
  svg.append(clip);
  fill.style.clipPath = `url(#${id})`;
  fill.append(svg);
  return id;
}

/** Слой выделения на странице, к которой относится текущее выделение, или null. */
interface SelectionTarget {
  /** Страница выделения. */
  pageEl: HTMLElement;
  /** Наложение заметок страницы. */
  overlay: Element;
  /** Диапазон выделения. */
  range: Range;
  /** Рекомендуемая позиция метки создания заметки (первая строка). */
  first: DOMRect | undefined;
}

/** Проверка, что выделение целиком лежит в одном текстовом слое страницы. */
export function selectionTarget(selection: Selection | null): SelectionTarget | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const startLayer = elementOf(range.startContainer)?.closest(`.${TEXT_LAYER_CLASS}`);
  const endLayer = elementOf(range.endContainer)?.closest(`.${TEXT_LAYER_CLASS}`);
  if (!startLayer || startLayer !== endLayer) {
    return null;
  }
  const pageEl = startLayer.closest('.page') as HTMLElement | null;
  const overlay = pageEl ? overlayOf(pageEl) : null;
  if (!pageEl || !overlay) {
    return null;
  }
  return { pageEl, overlay, range, first: range.getClientRects()[0] };
}

/** Идентификатор маски: уникален на документ. */
let selectionClipId = 0;

/**
 * Перерисовка слоя выделения по текущему выделению текста.
 *
 * Вертикальные метки («курсоры») ставятся только у краёв всего выделения.
 * Заливка ложится умножением (на тёмной стороне — осветлением), растр текста
 * остаётся чётким. Прежний слой всегда снимается: слоёв выделения на документ
 * не больше одного.
 */
export function renderSelection(): void {
  for (const stale of document.querySelectorAll(`.${SELECTION_LAYER_CLASS}`)) {
    stale.remove();
  }
  const target = selectionTarget(window.getSelection());
  if (!target) {
    return;
  }
  const pageBounds = target.pageEl.getBoundingClientRect();
  const rects = selectionRects(target.range, pageBounds);
  if (rects.length === 0) {
    return;
  }
  // Полосы и заливка приводятся к межстрочному шагу (см. `tileByLine`):
  // выделение одинаково и на цифровой странице, и на скане.
  const { merged: bands } = tileByLine(rects);
  if (bands.length === 0) {
    return;
  }
  const layer = document.createElement('div');
  layer.className = SELECTION_LAYER_CLASS;
  const fill = document.createElement('div');
  fill.className = 'selection-fill';
  selectionClipId += 1;
  // Заливка — по полосам строк, а не по кускам слов: иначе между словами
  // остаются белые щели, и блок текста не выглядит единой фигурой. Полоса
  // строки уже покрывает промежутки между словами, но не выходит за границы
  // выделения.
  applyFillMask(fill, bands, selectionClipId);
  layer.append(fill);
  bands.forEach((rect, index) => {
    const band = document.createElement('div');
    band.className = 'selection-band';
    band.style.left = rect.x * 100 + '%';
    band.style.top = rect.y * 100 + '%';
    band.style.width = rect.width * 100 + '%';
    band.style.height = rect.height * 100 + '%';
    // Метки — только у краёв всего выделения: левая в его начале, правая в
    // конце. У промежуточных строк меток нет, иначе они читаются как отдельные
    // выделения (особенно при строках разной длины).
    const isStart = index === 0;
    const isEnd = index === bands.length - 1;
    band.dataset.edge = isStart && isEnd ? 'both' : isStart ? 'start' : isEnd ? 'end' : 'none';
    layer.append(band);
  });
  // Слой лежит поверх канваса, но под оверлеем заметок.
  target.pageEl.insertBefore(layer, target.overlay);
}

/** Прямоугольники текущего выделения в долях страницы для создания цитаты. */
export function selectionQuote(): {
  /** Страница выделения. */
  pageEl: HTMLElement;
  /** Текст выделения. */
  quote: string;
  /** Прямоугольники в долях страницы. */
  rects: Rect[];
  /** Рекомендуемая позиция метки создания заметки. */
  position: { x: number; y: number };
} | null {
  const target = selectionTarget(window.getSelection());
  if (!target) {
    return null;
  }
  const quote = target.range.toString().replace(/\s+/g, ' ').trim();
  if (!quote) {
    return null;
  }
  const pageBounds = target.pageEl.getBoundingClientRect();
  const rects = selectionRects(target.range, pageBounds);
  if (rects.length === 0) {
    return null;
  }
  const first = target.first;
  return {
    pageEl: target.pageEl,
    quote,
    rects,
    position: first
      ? { x: first.left, y: first.bottom }
      : { x: pageBounds.left, y: pageBounds.bottom },
  };
}
