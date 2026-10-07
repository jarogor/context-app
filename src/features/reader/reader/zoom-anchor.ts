/** Удержание читаемого места при масштабировании и перестройке текста.
 *
 * Модуль чист от Svelte: по документу книги находит «опорную строку» у верха
 * области чтения и восстанавливает её экранную позицию после reflow. Опорой
 * служит живой `Range`, который переживает перестройку текста точнее, чем
 * пересчёт координат по разметке.
 */

import { ZOOM_ANCHOR_MARGIN } from './reader-document';

/** Живая ссылка на опорную строку области чтения и её экранный отступ. */
export interface ZoomAnchor {
  /** Диапазон опорной строки или `null`, если определить не удалось. */
  range: Range | null;
  /** Экранная координата опорной строки в момент захвата. */
  top: number;
}

/** Захват опорной строки у верха области чтения. */
export function captureAnchor(doc: Document | null): ZoomAnchor {
  const range = doc ? topAnchorRange(doc) : null;
  return { range, top: range ? range.getBoundingClientRect().top : 0 };
}

/** Восстановление захваченной опорной строки после перестройки текста. */
export function restoreAnchor(doc: Document | null, anchor: ZoomAnchor): void {
  const root = doc?.scrollingElement ?? doc?.documentElement;
  const range = anchor.range;
  if (!doc || !root || !range) {
    return;
  }
  // Диапазон мог быть разрушен перерисовкой (например, подсветками).
  try {
    if (!doc.body?.contains(range.startContainer)) {
      return;
    }
  } catch {
    return;
  }
  const delta = range.getBoundingClientRect().top - anchor.top;
  if (delta) {
    root.scrollTop += delta;
  }
}

/** Применение масштаба с удержанием опорной строки на месте. */
export function applyZoom(doc: Document | null, percent: number): void {
  const win = doc?.defaultView;
  const root = doc?.scrollingElement ?? doc?.documentElement;
  if (!doc || !win || !root) {
    return;
  }
  const anchor = topAnchorRange(doc);
  const topBefore = anchor ? anchor.getBoundingClientRect().top : 0;
  doc.documentElement.style.fontSize = `${percent}%`;
  const topAfter = anchor ? anchor.getBoundingClientRect().top : 0;
  const delta = topAfter - topBefore;
  if (delta) {
    root.scrollTop += delta;
  }
}

/** Живая ссылка на опорную строку у верха области чтения.
 *
 * Возвращает диапазон, привязанный к символу во второй видимой строке. Пока
 * строка живёт в документе, её `getBoundingClientRect` остаётся точкой опоры
 * даже при перестройке текста, поэтому масштаб не сдвигает читаемое место.
 */
export function topAnchorRange(doc: Document): Range | null {
  const win = doc.defaultView;
  if (!win) {
    return null;
  }
  const x = Math.round(win.innerWidth / 2);
  const body = doc.body ?? doc.documentElement;
  const lineHeight = body ? parseFloat(win.getComputedStyle(body).lineHeight) || 24 : 24;
  const y = Math.round(ZOOM_ANCHOR_MARGIN + lineHeight);
  const caretRange = (
    doc as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  ).caretRangeFromPoint;
  if (typeof caretRange === 'function') {
    const range = caretRange.call(doc, x, y);
    if (range) {
      return range;
    }
  }
  const caretPosition = (
    doc as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    }
  ).caretPositionFromPoint;
  if (typeof caretPosition === 'function') {
    const position = caretPosition.call(doc, x, y);
    if (position) {
      const range = doc.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.setEnd(position.offsetNode, position.offset);
      return range;
    }
  }
  return null;
}
