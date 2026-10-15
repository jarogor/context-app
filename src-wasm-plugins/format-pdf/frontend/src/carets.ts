/** Каретки текстового слоя: поиск позиции и восстановление концов цитаты.
 *
 * Анкер цитаты хранит прямоугольники, а не смещения текста. Чтобы тянуть границы
 * по символам, концы выделения восстанавливаются как позиции каретки в текстовом
 * слое, а прямоугольники строятся из диапазона между ними.
 */
import { TEXT_LAYER_CLASS, elementOf } from './dom';
import type { Caret, NoteAnchor, Rect } from './types';

/** Крайние прямоугольники цитаты: первый и последний по порядку чтения. */
export function edgeRects(
  rects: Rect[] | null | undefined,
): { first: Rect; last: Rect } | null {
  const sorted = (rects || []).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  if (sorted.length === 0) {
    return null;
  }
  return { first: sorted[0], last: sorted[sorted.length - 1] };
}

/** Позиция каретки в текстовом слое страницы по координатам указателя. */
export function caretAtPoint(
  pageEl: HTMLElement,
  clientX: number,
  clientY: number,
): Caret | null {
  const bounds = pageEl.getBoundingClientRect();
  const pointX = Math.max(bounds.left + 1, Math.min(bounds.right - 1, clientX));
  const pointY = Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, clientY));
  const caretRangeFromPoint: ((x: number, y: number) => Range | null) | null =
    typeof document.caretRangeFromPoint === 'function'
      ? document.caretRangeFromPoint.bind(document)
      : typeof document.caretPositionFromPoint === 'function'
        ? (x: number, y: number) => {
            const position = document.caretPositionFromPoint(x, y);
            if (!position) {
              return null;
            }
            const range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.setEnd(position.offsetNode, position.offset);
            return range;
          }
        : null;
  const range = caretRangeFromPoint ? caretRangeFromPoint(pointX, pointY) : null;
  if (!range) {
    return null;
  }
  const layer = elementOf(range.startContainer)?.closest(`.${TEXT_LAYER_CLASS}`);
  if (!layer || !pageEl.contains(layer)) {
    return null;
  }
  return { node: range.startContainer, offset: range.startOffset, layer };
}

/** Диапазон между двумя позициями каретки независимо от их порядка. */
export function rangeBetweenCarets(startCaret: Caret, endCaret: Caret): Range | null {
  const build = (from: Caret, to: Caret): Range | null => {
    const range = document.createRange();
    try {
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
    } catch (error) {
      return null;
    }
    return range.toString().length > 0 ? range : null;
  };
  return build(startCaret, endCaret) || build(endCaret, startCaret);
}

/** Восстановление концов цитаты как кареток по её крайним прямоугольникам. */
export function resolveResizeCarets(
  anchor: NoteAnchor,
  pageEl: HTMLElement,
): { start: Caret; end: Caret } | null {
  const edges = edgeRects(anchor.rects);
  if (!edges) {
    return null;
  }
  const bounds = pageEl.getBoundingClientRect();
  const start = caretAtPoint(
    pageEl,
    bounds.left + edges.first.x * bounds.width + 1,
    bounds.top + (edges.first.y + edges.first.height / 2) * bounds.height,
  );
  const end = caretAtPoint(
    pageEl,
    bounds.left + (edges.last.x + edges.last.width) * bounds.width - 1,
    bounds.top + (edges.last.y + edges.last.height / 2) * bounds.height,
  );
  return start && end ? { start, end } : null;
}
