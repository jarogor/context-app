/** Геометрические вычисления области чтения и структуры диапазонов текста.
 *
 * Модуль чист от Svelte: доли точки внутри раздела главы, ограничение значения,
 * смещение узла в символах, рамка маленького диапазона у края цитаты и поиск
 * раздела главы под координатами. Используется компонентами текстового чтения.
 */

import { CHAPTER_CLASS } from './document';

/** Прямоугольник в системе координат документа книги. */
export interface DocRect {
  /** Отступ слева. */
  x: number;
  /** Отступ сверху. */
  y: number;
  /** Ширина. */
  width: number;
  /** Высота. */
  height: number;
}

/** Ограничение доли диапазоном [0, 1]. */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Доли точки внутри раздела главы по координатам события. */
export function pointFraction(
  section: Element,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = section.getBoundingClientRect();
  const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return { x: clamp01(x), y: clamp01(y) };
}

/** Раздел главы под координатами события. */
export function chapterAt(doc: Document | null, clientX: number, clientY: number): Element | null {
  const element = doc?.elementFromPoint(clientX, clientY) as Element | null;
  return element?.closest?.(`.${CHAPTER_CLASS}`) ?? null;
}

/** Смещение узла в символах относительно начала главы. */
export function charOffset(root: Node, node: Node, offset: number): number | null {
  const owner = root.ownerDocument;
  if (!owner || !root.contains(node)) {
    return null;
  }
  const range = owner.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** Рамка маленького диапазона в начале или конце цитаты (для маркеров).
 *
 * Возвращает прямоугольник в системе координат раздела главы; для правого края
 * берётся последний прямоугольник диапазона.
 */
export function rangeHandleRect(
  section: Element,
  range: Range | null,
  edge: 'start' | 'end',
): DocRect | null {
  if (!range) {
    return null;
  }
  const rects = Array.from(range.getClientRects());
  const rect = edge === 'start' ? rects[0] : (rects[rects.length - 1] ?? rects[0]);
  const bounds = section.getBoundingClientRect();
  if (!rect) {
    return null;
  }
  return {
    x: rect.left - bounds.left,
    y: rect.top - bounds.top,
    width: rect.width,
    height: rect.height,
  };
}
