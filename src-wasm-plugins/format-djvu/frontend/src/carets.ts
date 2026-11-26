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

/** Кусок строки текстового слоя: span, его текстовый узел и экранные границы. */
interface TextSpan {
  /** Элемент куска. */
  span: Element;
  /** Текстовый узел куска. */
  text: Text;
  /** Экранные границы куска. */
  bounds: DOMRect;
}

/** Строка текстового слоя: куски по порядку чтения и общие границы. */
interface TextLine {
  /** Куски строки слева направо. */
  spans: TextSpan[];
  /** Общие экранные границы строки. */
  bounds: { top: number; bottom: number; left: number; right: number };
}

/** Строки текстового слоя в порядке чтения.
 *
 * В слое DjVu слова приходят отдельными `span`: без сборки строк каждый `span`
 * считался бы строкой, и позиция по горизонтали искалась бы только внутри него.
 * Из-за этого выделение и правка границы прыгали между словами, а страница
 * дёргалась. Здесь куски с общим вертикальным перекрытием собираются в одну
 * строку и упорядочиваются по левому краю — так же, как при сборке полос
 * выделения (`tileByLine`).
 */
function textLines(layer: Element): TextLine[] {
  const spans: TextSpan[] = Array.from(layer.querySelectorAll('span'))
    .filter((span) => span.firstChild && span.firstChild.nodeType === Node.TEXT_NODE)
    .map((span) => ({
      span,
      text: span.firstChild as Text,
      bounds: span.getBoundingClientRect(),
    }))
    .filter((span) => span.bounds.width > 0 && span.bounds.height > 0)
    .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
  const lines: TextLine[] = [];
  for (const span of spans) {
    const line = lines[lines.length - 1];
    const height = line ? Math.min(line.bounds.bottom - line.bounds.top, span.bounds.height) : 0;
    const overlap = line
      ? Math.min(line.bounds.bottom, span.bounds.bottom) -
        Math.max(line.bounds.top, span.bounds.top)
      : 0;
    // Заметное вертикальное перекрытие — та же строка.
    if (line && height > 0 && overlap > height * 0.5) {
      line.spans.push(span);
      line.bounds.top = Math.min(line.bounds.top, span.bounds.top);
      line.bounds.bottom = Math.max(line.bounds.bottom, span.bounds.bottom);
      line.bounds.left = Math.min(line.bounds.left, span.bounds.left);
      line.bounds.right = Math.max(line.bounds.right, span.bounds.right);
      continue;
    }
    lines.push({
      spans: [span],
      bounds: {
        top: span.bounds.top,
        bottom: span.bounds.bottom,
        left: span.bounds.left,
        right: span.bounds.right,
      },
    });
  }
  for (const line of lines) {
    line.spans.sort((a, b) => a.bounds.left - b.bounds.left);
  }
  return lines;
}

/** Строка, к которой относится точка: ближайшая по вертикали.
 *
 * В промежутке между строками зазор до соседних строк одинаков, и направление
 * протяжки решает, какая ближе: вперёд — нижняя, назад — верхняя. Без этого
 * конец выделения откатывался к строке с якорем и «залипал» на месте.
 * Направление нужно только для выбора строки; позиция внутри неё считается по
 * горизонтали.
 */
function lineAt(lines: TextLine[], clientY: number, forward?: boolean): TextLine | null {
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
      continue;
    }
    if (distance === bestDistance && forward !== undefined && best) {
      const earlier = line.bounds.top < best.bounds.top;
      if (forward !== earlier) {
        best = line;
      }
    }
  }
  return best;
}

/** Каретка на краю текстового блока, если точка за его пределами.
 *
 * Внутри блока и в промежутках между строками текстовой позиции нет только по
 * вертикали, но горизонталь известна: там каретка считается по ближайшей строке
 * (см. `layerCaretAtPoint`). Край нужен лишь когда точка ушла выше первой строки
 * или ниже последней — тогда выделение доводится до начала или до конца текста,
 * как это делает движок.
 */
export function lineEdgeCaretAtPoint(
  layer: Element,
  clientY: number,
): { node: Text; offset: number } | null {
  const lines = textLines(layer);
  if (lines.length === 0) {
    return null;
  }
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (clientY >= first.bounds.top && clientY <= last.bounds.bottom) {
    return null;
  }
  const above = clientY < first.bounds.top;
  const line = above ? first : last;
  const span = above ? line.spans[0] : line.spans[line.spans.length - 1];
  if (!span) {
    return null;
  }
  return { node: span.text, offset: above ? 0 : span.text.data.length };
}

/** Позиция в строке по горизонтали: кусок и смещение внутри него. */
function positionInLine(
  line: TextLine,
  clientX: number,
): { node: Text; offset: number } | null {
  const first = line.spans[0];
  const last = line.spans[line.spans.length - 1];
  if (!first || !last) {
    return null;
  }
  if (clientX <= first.bounds.left) {
    return { node: first.text, offset: 0 };
  }
  if (clientX >= last.bounds.right) {
    return { node: last.text, offset: last.text.data.length };
  }
  let best = first;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const span of line.spans) {
    const distance =
      clientX < span.bounds.left
        ? span.bounds.left - clientX
        : clientX > span.bounds.right
          ? clientX - span.bounds.right
          : 0;
    if (distance < bestDistance) {
      best = span;
      bestDistance = distance;
    }
    if (distance === 0) {
      break;
    }
  }
  const ratio = best.bounds.width > 0 ? (clientX - best.bounds.left) / best.bounds.width : 0;
  const offset = Math.max(
    0,
    Math.min(best.text.data.length, Math.round(ratio * best.text.data.length)),
  );
  return { node: best.text, offset };
}

/** Каретка по координатам указателя штатными средствами движка. */
function caretRangeAtPoint(clientX: number, clientY: number): Range | null {
  if (typeof document.caretRangeFromPoint === 'function') {
    return document.caretRangeFromPoint(clientX, clientY);
  }
  if (typeof document.caretPositionFromPoint === 'function') {
    const position = document.caretPositionFromPoint(clientX, clientY);
    if (!position) {
      return null;
    }
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.setEnd(position.offsetNode, position.offset);
    return range;
  }
  return null;
}

/** Каретка движка в текстовом слое, если он отдал её текстовой позицией. */
function engineCaretInLayer(
  layer: Element,
  clientX: number,
  clientY: number,
): { node: Text; offset: number } | null {
  const range = caretRangeAtPoint(clientX, clientY);
  const node = range?.startContainer;
  if (!range || !node || node.nodeType !== Node.TEXT_NODE || !layer.contains(node)) {
    return null;
  }
  return { node: node as Text, offset: range.startOffset };
}

/** Каретка в текстовом слое по геометрии строк.
 *
 * Нужна жестам, когда ответ движка бесполезен: точка между строк, в поле
 * страницы, ниже текста. Строка выбирается по вертикали, позиция внутри неё — по
 * горизонтали. Поле `inside` говорит, попала ли точка в полосу строки: над щелью
 * между строками позиции по тексту нет, и там нужен край строки.
 *
 * Ответ движка не отбрасывается: он точнее расчёта по ширине куска, но только
 * когда попал в ту же строку, что и точка.
 */
export function layerCaretAtPoint(
  layer: Element,
  clientX: number,
  clientY: number,
  forward = true,
): { node: Text; offset: number; inside: boolean } | null {
  const lines = textLines(layer);
  if (lines.length === 0) {
    const engine = engineCaretInLayer(layer, clientX, clientY);
    return engine ? { ...engine, inside: true } : null;
  }
  const line = lineAt(lines, clientY, forward);
  if (!line) {
    return null;
  }
  const inside = clientY >= line.bounds.top && clientY <= line.bounds.bottom;
  /* Позиция считается только по геометрии строки. Ответ движка точнее на глаз,
     но расходится с расчётом по ширине куска на пару символов. Пока внутри
     полосы брался он, а в промежутке между строками — расчёт, конец выделения
     дрожал на этих двух символах при каждом переходе через границу полосы.
     Геометрия даёт одну непрерывную шкалу на всю страницу. */
  const position = positionInLine(line, clientX);
  if (!position) {
    return null;
  }
  return { ...position, inside };
}

/** Диапазон визуальной строки под точкой: от начала полосы до её конца.
 *
 * Тройное нажатие выделяет строку — так же, как это делает движок. Выделение
 * строится по собранным строкам слоя, поэтому строка — это все слова полосы, а
 * не один `span` под указателем.
 */
export function lineRangeAtPoint(
  layer: Element,
  clientY: number,
  forward = true,
): Range | null {
  const lines = textLines(layer);
  if (lines.length === 0) {
    return null;
  }
  const line = lineAt(lines, clientY, forward);
  if (!line) {
    return null;
  }
  const first = line.spans[0];
  const last = line.spans[line.spans.length - 1];
  if (!first || !last) {
    return null;
  }
  const range = document.createRange();
  try {
    range.setStart(first.text, 0);
    range.setEnd(last.text, last.text.data.length);
  } catch (error) {
    return null;
  }
  return range.toString().length > 0 ? range : null;
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
  const range = caretRangeAtPoint(pointX, pointY);
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
 * когда он попал в ту же строку.
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
  if (exact && line.spans.some((span) => span.span.contains(exact.node))) {
    return exact;
  }
  const position = positionInLine(line, clientX);
  if (!position) {
    return null;
  }
  return { node: position.node, offset: position.offset, layer };
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
