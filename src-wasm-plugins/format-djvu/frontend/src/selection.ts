/** Живое выделение текста: полосы и метки по краям выделения.
 *
 * Видимое выделение рисует собственный слой: полосы строк и вертикальные метки
 * у краёв всего выделения. Нативное выделение в текстовом слое прозрачно и
 * служит только копированию.
 *
 * Заливка — полосы по строкам, а не один элемент с маской: `clip-path`
 * показывает заливку во всю страницу, пока браузер не разрешил маску, и на
 * кадре выделение захватывало лист целиком. Слой переиспользуется: полосы
 * обновляются на месте, иначе выделение мерцало при каждой правке диапазона.
 */
import { fillBands, type SelectionStyle } from '@context/selection';
import { SELECTION_LAYER_CLASS, elementOf, overlayOf, TEXT_LAYER_CLASS } from './dom';
import { tileByLine } from './lines';
import { clearSelectionBands, drawNotes, setSelectionBands } from './notes';
import { state } from './state';
import { selectionInProgress } from './text-selection';
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
  /* Высота — по фактическому боксу букв. Расширять её до межстрочного шага
     здесь нельзя: расширенные полосы соседних строк перекрываются, и `tileByLine`
     склеивает их в одну. Строки в середине выделения сливались, а крайние
     оставались по буквам — верхняя полоса выходила ниже остальных, нижняя выше.
     До шага полосы доводит уже `tileByLine`. */
  for (const bounds of spanRects(range)) {
    if (bounds.width <= 0 || bounds.height <= 0) {
      continue;
    }
    rects.push(fractionRect(bounds, pageBounds));
  }
  return rects;
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

/** Межстрочный шаг страницы в CSS-пикселях; 0 — шаг неизвестен.
 *
 * Шаг измерен слоем по всем строкам страницы (`data-line-pitch`) и не зависит
 * от состава выделения. Брать его из самого выделения нельзя: у одной строки он
 * равен нулю, и полоса выходила высотой с буквы, а при протяжке вниз шаг рос и
 * верхняя полоса перескакивала на полстроки.
 */
function pagePitch(pageEl: HTMLElement): number {
  const layer = pageEl.querySelector<HTMLElement>(`.${TEXT_LAYER_CLASS}`);
  const value = layer ? Number.parseFloat(layer.dataset.linePitch ?? '') : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Снятие полос выделения со всех страниц и перерисовка их растров. */
function clearBands(): void {
  for (const change of clearSelectionBands()) {
    drawNotes(change.pageEl, state.notes, change.region);
  }
}

/** Снятие слоя выделения со всех страниц. */
function clearLayers(): void {
  for (const stale of document.querySelectorAll(`.${SELECTION_LAYER_CLASS}`)) {
    stale.remove();
  }
}

/** Слой выделения страницы; создаётся при первом использовании. */
function layerOf(target: SelectionTarget): HTMLElement {
  const existing = target.pageEl.querySelector(`.${SELECTION_LAYER_CLASS}`);
  if (existing instanceof HTMLElement) {
    return existing;
  }
  const layer = document.createElement('div');
  layer.className = SELECTION_LAYER_CLASS;
  // Слой лежит поверх канваса, но под оверлеем заметок.
  target.pageEl.insertBefore(layer, target.overlay);
  return layer;
}

/**
 * Перерисовка слоя выделения по текущему выделению текста.
 *
 * Полосы строятся по прямоугольникам диапазона и приводятся к межстрочному шагу
 * (см. `tileByLine`). Вертикальные метки («курсоры») ставятся только у краёв
 * всего выделения.
 */
export function renderSelection(): void {
  const target = selectionTarget(window.getSelection());
  if (!target) {
    /* Пока идёт протяжка, выделение восстановит `clampTextSelection` по точке
       указателя. Снимать слой здесь — значит на кадр показать страницу без
       выделения: оно мерцало и «пропадало» у пользователя. */
    if (selectionInProgress()) {
      return;
    }
    clearLayers();
    clearBands();
    return;
  }
  const pageBounds = target.pageEl.getBoundingClientRect();
  const rects = selectionRects(target.range, pageBounds);
  // Полосы — в долях страницы, а шаг измерен в CSS-пикселях: перед передачей
  // он приводится к тем же долям.
  const pitchFraction = pageBounds.height > 0 ? pagePitch(target.pageEl) / pageBounds.height : 0;
  const { merged: bands } = tileByLine(rects, pitchFraction);
  if (bands.length === 0) {
    clearLayers();
    clearBands();
    return;
  }
  /* Заливка — в растре страницы: полоса слоем ложится плёнкой на буквы, и
     текст мутнеет. Растр перерисовывается, только когда полосы изменились:
     на каждом движении указателя это была бы лишняя работа. */
  for (const change of setSelectionBands(target.pageEl, bands)) {
    drawNotes(change.pageEl, state.notes, change.region);
  }
  /* Слой целевой страницы не снимается: полосы обновляются на месте. Снятие и
     пересоздание слоя на каждое изменение выделения и давало мерцание. Слои
     других страниц убираются — выделение живёт в одном текстовом слое. */
  const layer = layerOf(target);
  for (const stale of document.querySelectorAll(`.${SELECTION_LAYER_CLASS}`)) {
    if (stale !== layer) {
      stale.remove();
    }
  }
  /* Заливка и обводка краёв — на одном элементе общего слоя: их высота берётся
     из одного прямоугольника и разойтись не может. */
  fillBands(layer, bands, selectionStyle(), (rect) => ({
    left: rect.x * 100 + '%',
    top: rect.y * 100 + '%',
    width: rect.width * 100 + '%',
    height: rect.height * 100 + '%',
  }));
}

/** Оформление слоя выделения из токенов темы страницы. */
function selectionStyle(): SelectionStyle {
  const root = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string =>
    root.getPropertyValue(name).trim() || fallback;
  const width = Number.parseFloat(read('--reader-selection-edge-width', '1'));
  return {
    /* Заливка страницы нарисована в растре (`notes.ts`): слой несёт только
       обводку краёв, иначе заливка легла бы дважды и текст под ней потемнел. */
    fill: 'transparent',
    edge: read('--reader-selection-edge', 'rgba(37, 99, 235, 0.9)'),
    edgeWidth: Number.isFinite(width) && width > 0 ? width : 1,
  };
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
