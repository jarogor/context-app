/** Живое выделение текста: полосы и метки по краям выделения.
 *
 * Видимое выделение рисует собственный слой: полосы строк и вертикальные метки
 * у краёв всего выделения. Нативное выделение в текстовом слое прозрачно и
 * служит только копированию.
 *
 * Заливка — полосы по строкам, а не один элемент с маской. Маска (`clip-path`)
 * рисует заливку во всю страницу, пока браузер не разрешил её, — на кадре
 * выделение захватывало весь лист, а текст под ним темнел. Полосы видны сразу и
 * покрывают только выделенный текст.
 *
 * Слой один на страницу и переиспользуется: полосы обновляются на месте. Раньше
 * слой снимался и создавался заново на каждое изменение выделения — за одну
 * протяжку это 20+ раз, и выделение мерцало.
 */
import { SELECTION_LAYER_CLASS, elementOf, overlayOf, TEXT_LAYER_CLASS } from './dom';
import { tileByLine } from './lines';
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

/** Прямоугольники диапазона в долях страницы. */
export function selectionRects(range: Range, pageBounds: DOMRect): Rect[] {
  const rects: Rect[] = [];
  for (const bounds of range.getClientRects()) {
    if (bounds.width <= 0 || bounds.height <= 0) {
      continue;
    }
    rects.push(fractionRect(bounds, pageBounds));
  }
  return rects;
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
 * (см. `tileByLine`): выделение одинаково и на цифровой странице, и на скане.
 * Вертикальные метки («курсоры») ставятся только у краёв всего выделения.
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
    return;
  }
  const pageBounds = target.pageEl.getBoundingClientRect();
  const rects = selectionRects(target.range, pageBounds);
  const { merged: bands } = tileByLine(rects);
  if (bands.length === 0) {
    clearLayers();
    return;
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
  layer.replaceChildren();
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
