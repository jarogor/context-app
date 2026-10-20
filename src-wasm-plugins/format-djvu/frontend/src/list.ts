/** Виртуальная раскладка страниц книги.
 *
 * Книга DjVu бывает на тысячи страниц: держать и обмерять все страницы сразу
 * нельзя. В разметке живут только страницы у видимой области чтения, а остальные
 * заменены двумя распорками — до и после окна. Их высота складывается из
 * натуральных размеров страниц при текущем масштабе, поэтому полоса прокрутки
 * соответствует всей книге, а число элементов в документе остаётся малым.
 */
import { OVERLAY_CLASS, pagesEl, viewer } from './dom';
import { state } from './state';

/** Отступ сверху списка страниц (совпадает с `padding` в `style.css`). */
export const LIST_PADDING_TOP = 16;
/** Промежуток между страницами. */
export const PAGE_GAP = 12;
/** Сколько страниц держать про запас в каждую сторону от видимой области. */
export const OVERSCAN = 2;

/** Масштаб отображения: 100 % — естественный размер страницы файла. */
export function zoomScale(): number {
  return state.zoom / 100;
}

/** Натуральный размер страницы (в CSS-пикселях без масштаба).
 *
 * Размеры страниц читаются лениво: неизвестные берут размер первой страницы,
 * поэтому раскладка книги на тысячи страниц строится без их разбора.
 */
export function pageNatural(index: number): { width: number; height: number } {
  return state.naturalSizes[index] || state.defaultSize;
}

/** Размер страницы в CSS-пикселях при текущем масштабе. */
export function pageSize(index: number): { width: number; height: number } {
  const natural = pageNatural(index);
  const scale = zoomScale();
  return { width: natural.width * scale, height: natural.height * scale };
}

/** Высота страницы при текущем масштабе. */
function pageHeight(index: number): number {
  return pageNatural(index).height * zoomScale();
}

/** Кегль виртуальной раскладки (пересчитывается при смене масштаба). */
export function rebuildMetrics(): void {
  const count = state.pageCount;
  const offsets = new Array<number>(count + 1);
  offsets[0] = 0;
  for (let index = 0; index < count; index += 1) {
    offsets[index + 1] = offsets[index] + pageHeight(index) + PAGE_GAP;
  }
  state.offsets = offsets;
  // Отступы списка сверху и снизу (совпадают с `padding` в `style.css`).
  state.totalHeight = LIST_PADDING_TOP * 2 + (offsets[count] ?? 0);
}

/** Смещение верха страницы (1-based) от начала списка, CSS px. */
export function pageOffset(page: number): number {
  const index = Math.max(0, Math.min(state.pageCount, page));
  return LIST_PADDING_TOP + (state.offsets[index - 1] ?? 0);
}

/** Общая высота списка страниц, CSS px. */
export function listHeight(): number {
  return state.totalHeight;
}

/** Страница у заданной позиции прокрутки (1-based). */
export function pageAtOffset(top: number): number {
  const count = state.pageCount;
  if (count === 0) {
    return 1;
  }
  let low = 1;
  let high = count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (pageOffset(middle) + pageHeight(middle - 1) > top + 8) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

/** Диапазон страниц, которые нужно держать в разметке (1-based, включительно). */
export function visibleRange(): { first: number; last: number } {
  const count = state.pageCount;
  if (count === 0) {
    return { first: 1, last: 0 };
  }
  const top = viewer.scrollTop;
  const bottom = top + Math.max(1, viewer.clientHeight);
  let first = pageAtOffset(top);
  while (first > 1 && pageOffset(first) + pageHeight(first - 1) > top) {
    first -= 1;
  }
  let last = first;
  for (let page = first; page <= count; page += 1) {
    last = page;
    if (pageOffset(page) > bottom) {
      break;
    }
  }
  first = Math.max(1, first - OVERSCAN);
  last = Math.min(count, last + OVERSCAN);
  return { first, last };
}

/** Распорка списка до или после окна страниц. */
export function spacerElement(where: 'top' | 'bottom'): HTMLElement {
  const existing =
    where === 'top' ? state.spacerTop : state.spacerBottom;
  if (existing) {
    return existing;
  }
  const spacer = document.createElement('div');
  spacer.className = 'page-spacer';
  spacer.dataset.spacer = where;
  if (where === 'top') {
    state.spacerTop = spacer;
  } else {
    state.spacerBottom = spacer;
  }
  return spacer;
}

/** Пустой список и его распорки. */
export function resetList(): void {
  pagesEl.replaceChildren();
  state.pages.clear();
  state.windowStart = 1;
  state.windowEnd = 0;
  state.spacerTop = null;
  state.spacerBottom = null;
  state.rendered.clear();
  state.pending.clear();
}

/** Создание недостающих и удаление лишних страниц окна. */
export function realizeWindow(): void {
  const { first, last } = visibleRange();
  const count = state.pageCount;
  // Удаление страниц вне окна.
  for (const [page, pageEl] of [...state.pages.entries()]) {
    if (page < first || page > last) {
      pageEl.remove();
      state.rendered.delete(pageEl);
      state.pending.delete(pageEl);
      state.pages.delete(page);
    }
  }
  // Создание недостающих страниц.
  for (let page = first; page <= last; page += 1) {
    if (state.pages.has(page)) {
      continue;
    }
    const index = page - 1;
    const size = pageSize(index);
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    pageEl.dataset.page = String(page);
    pageEl.style.width = size.width + 'px';
    pageEl.style.height = size.height + 'px';
    pageEl.style.marginBottom = PAGE_GAP + 'px';
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    pageEl.append(overlay);
    state.pages.set(page, pageEl);
  }
  // Порядок и распорки: сверху всё, что до окна, снизу — что после.
  const top = spacerElement('top');
  const bottom = spacerElement('bottom');
  top.style.height = Math.max(0, state.offsets[first - 1] ?? 0) + 'px';
  bottom.style.height =
    Math.max(0, (state.offsets[count] ?? 0) - (state.offsets[last] ?? 0)) + 'px';
  // Перестройка DOM только при смене набора страниц: на прокрутке в пределах
  // окна достаточно высот распорок.
  const sameRange = state.windowStart === first && state.windowEnd === last;
  if (!sameRange || !sequenceMatches(first, last)) {
    const fragment = document.createDocumentFragment();
    fragment.append(top);
    for (let page = first; page <= last; page += 1) {
      const pageEl = state.pages.get(page);
      if (pageEl) {
        fragment.append(pageEl);
      }
    }
    fragment.append(bottom);
    pagesEl.replaceChildren(fragment);
  }
  state.windowStart = first;
  state.windowEnd = last;
}

/** Совпадает ли текущая последовательность потомков с окном страниц. */
function sequenceMatches(first: number, last: number): boolean {
  const children = pagesEl.children;
  const expected = last - first + 3;
  if (children.length !== expected) {
    return false;
  }
  if (children[0] !== state.spacerTop || children[expected - 1] !== state.spacerBottom) {
    return false;
  }
  for (let offset = 0; offset <= last - first; offset += 1) {
    if (children[offset + 1] !== state.pages.get(first + offset)) {
      return false;
    }
  }
  return true;
}
