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

/** Строка текстового слоя: span, его текстовый узел и экранные границы. */
interface TextLine {
  /** Элемент строки в текстовом слое. */
  span: Element;
  /** Текстовый узел строки. */
  text: Text;
  /** Экранные границы строки. */
  bounds: DOMRect;
}

/** Строки текстового слоя в порядке чтения. */
function textLines(layer: Element): TextLine[] {
  return Array.from(layer.querySelectorAll('span'))
    .filter((span) => span.firstChild && span.firstChild.nodeType === Node.TEXT_NODE)
    .map((span) => ({
      span,
      text: span.firstChild as Text,
      bounds: span.getBoundingClientRect(),
    }))
    .filter((line) => line.bounds.width > 0 && line.bounds.height > 0)
    .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
}

/** Строка, к которой относится точка: ближайшая по вертикали. */
function lineAt(lines: TextLine[], clientY: number): TextLine | null {
  let best: TextLine | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const distance =
      clientY < line.bounds.top
        ? line.bounds.top - clientY
        : clientY > line.bounds.bottom
          ? clientY - line.bounds.bottom
          : 0;
    if (distance < bestDistance) {
      best = line;
      bestDistance = distance;
    }
    if (distance === 0) {
      break;
    }
  }
  return best;
}

/** Каретка от движка по координатам указателя, если он её отдал. */
function caretFromEngine(
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
  const node = range?.startContainer;
  if (!range || !node || node.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const layer = elementOf(node)?.closest(`.${TEXT_LAYER_CLASS}`);
  if (!layer || !pageEl.contains(layer)) {
    return null;
  }
  return { node, offset: range.startOffset, layer };
}

/** Позиция каретки в текстовом слое страницы по координатам указателя.
 *
 * Строка выбирается по геометрии слоя, а не по ответу движка: для точки между
 * строк, в поле страницы или ниже текста он отдаёт ближайший текст по-своему и
 * нередко строкой выше. Из-за этого конец цитаты прыгал на предыдущую строку,
 * и правка «не шла» дальше неё. Здесь строка определяется по вертикали, а
 * позиция внутри строки — по горизонтали; ответ движка берётся только тогда,
 * когда он попал в ту же строку (тогда смещение точнее нашего расчёта).
 */
export function caretAtPoint(
  pageEl: HTMLElement,
  clientX: number,
  clientY: number,
): Caret | null {
  const layer = pageEl.querySelector(`.${TEXT_LAYER_CLASS}`);
  if (!layer) {
    return null;
  }
  const lines = textLines(layer);
  if (lines.length === 0) {
    return null;
  }
  const line = lineAt(lines, clientY);
  if (!line) {
    return null;
  }
  const exact = caretFromEngine(pageEl, clientX, clientY);
  if (exact && line.span.contains(exact.node)) {
    return exact;
  }
  const ratio = line.bounds.width > 0 ? (clientX - line.bounds.left) / line.bounds.width : 0;
  const offset = Math.max(
    0,
    Math.min(line.text.data.length, Math.round(ratio * line.text.data.length)),
  );
  return { node: line.text, offset, layer };
}

/** Диапазон между двумя позициями каретки независимо от их порядка. */
export function rangeBetweenCarets(startCaret: Caret, endCaret: Caret): Range | null {
  const build = (from: Caret, to: Caret): Range | null => {
    /* Диапазон строится только по текстовым позициям: у элемента смещение
       относится к дочерним узлам, и граница встала бы не по курсору, а на краю
       слоя. */
    if (from.node.nodeType !== Node.TEXT_NODE || to.node.nodeType !== Node.TEXT_NODE) {
      return null;
    }
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
