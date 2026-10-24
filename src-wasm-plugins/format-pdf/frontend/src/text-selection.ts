/** Ограничение живого выделения текстовым слоем страницы.
 *
 * Браузер достраивает выделение от ближайшего текста до указателя, поэтому
 * протяжка, начатая в поле страницы (мимо слова, между строками, по канвасу
 * растра) или уведённая за страницу, давала выделение всего документа — как
 * область, а не как текст. Здесь выделение начинается только на слове
 * текстового слоя и остаётся в пределах этого слоя: концам диапазона, вышедшим
 * за слой, ставится крайний текст страницы.
 *
 * Пока идёт протяжка, нативное выделение браузера выключено (`user-select`),
 * иначе движок успевает добавить к диапазону текст из соседних слоёв раньше,
 * чем его можно обрезать.
 */
import { TEXT_LAYER_CLASS } from './dom';

/** Признак идущей протяжки выделения на корне документа. */
const TEXT_SELECTING_ATTR = 'data-text-selecting';
/** Признак слоя, с которого начата протяжка выделения. */
const TEXT_ANCHOR_ATTR = 'data-selecting';

/** Позиция каретки в текстовом слое. */
interface Edge {
  /** Текстовый узел. */
  node: Node;
  /** Смещение внутри узла. */
  offset: number;
}

/** Слой, с которого начата протяжка выделения. */
let anchorLayer: Element | null = null;

/** Защита от повторного входа при собственной правке выделения. */
let clamping = false;

/** Текстовый слой и слово, на котором начата протяжка, или null. */
function anchorOf(target: EventTarget | null): Element | null {
  const span = target instanceof Element ? target.closest(`.${TEXT_LAYER_CLASS} span`) : null;
  return span ? span.closest(`.${TEXT_LAYER_CLASS}`) : null;
}

/** Крайние текстовые позиции слоя в порядке чтения. */
export function layerEdges(layer: Element): { start: Edge; end: Edge } | null {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let first: Node | null = null;
  let last: Node | null = null;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (text.data.length > 0) {
      first = first || text;
      last = text;
    }
    node = walker.nextNode();
  }
  if (!first || !last) {
    return null;
  }
  return {
    start: { node: first, offset: 0 },
    end: { node: last, offset: (last as Text).data.length },
  };
}

/** Обрезка диапазона краями текстового слоя.
 *
 * Возвращает `null`, если диапазон целиком лежит в слое и менять его не нужно.
 * Концы, оказавшиеся вне слоя, ставятся на крайний текст страницы, поэтому
 * выделение не выходит за её пределы и не превращается в область документа.
 */
export function clampRange(range: Range, layer: Element): Range | null {
  const startInside = layer.contains(range.startContainer);
  const endInside = layer.contains(range.endContainer);
  if (startInside && endInside) {
    return null;
  }
  const edges = layerEdges(layer);
  if (!edges) {
    return null;
  }
  const next = document.createRange();
  if (startInside) {
    next.setStart(range.startContainer, range.startOffset);
  } else {
    next.setStart(edges.start.node, edges.start.offset);
  }
  if (endInside) {
    next.setEnd(range.endContainer, range.endOffset);
  } else {
    next.setEnd(edges.end.node, edges.end.offset);
  }
  return next.collapsed ? null : next;
}

/** Снятие текущего выделения без повторной обработки. */
function clearSelection(): void {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  clamping = true;
  try {
    selection.removeAllRanges();
  } finally {
    clamping = false;
  }
}

/** Отметки протяжки: корень документа и слой, с которого она началась. */
function mark(layer: Element | null): void {
  document.documentElement.setAttribute(TEXT_SELECTING_ATTR, '');
  if (layer) {
    layer.setAttribute(TEXT_ANCHOR_ATTR, '');
  }
}

/** Начало протяжки выделения по указателю.
 *
 * Протяжка, начатая на слове текстового слоя, разрешает выделение только этому
 * слою; начатая вне текста — выключает нативное выделение совсем, поэтому
 * протяжка по канвасу растра или полю страницы ничего не выделяет.
 */
export function beginTextSelection(event: PointerEvent): void {
  endTextSelection();
  const layer = anchorOf(event.target);
  if (layer) {
    anchorLayer = layer;
    mark(layer);
    return;
  }
  // Касанием прокручивают книгу, а средней кнопкой вставляют выделенное:
  // отмена такого нажатия сломала бы прокрутку и вставку.
  if (event.pointerType === 'touch' || event.button !== 0) {
    return;
  }
  event.preventDefault();
  clearSelection();
  mark(null);
}

/** Завершение протяжки выделения: ограничения снимаются. */
export function endTextSelection(): void {
  anchorLayer = null;
  const root = document.documentElement;
  if (root.hasAttribute(TEXT_SELECTING_ATTR)) {
    root.removeAttribute(TEXT_SELECTING_ATTR);
  }
  for (const layer of document.querySelectorAll(`[${TEXT_ANCHOR_ATTR}]`)) {
    layer.removeAttribute(TEXT_ANCHOR_ATTR);
  }
}

/** Ограничение идущего выделения слоем, на котором оно начато. */
export function clampTextSelection(): void {
  if (clamping || !anchorLayer) {
    return;
  }
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }
  const clamped = clampRange(selection.getRangeAt(0), anchorLayer);
  if (!clamped) {
    return;
  }
  clamping = true;
  try {
    selection.removeAllRanges();
    selection.addRange(clamped);
  } finally {
    clamping = false;
  }
}
