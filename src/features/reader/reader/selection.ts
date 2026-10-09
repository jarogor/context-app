/** Слой активного выделения текста во встроенном чтении.
 *
 * Заливку выделения и вертикальные метки по краям полос рисует этот слой, а не
 * нативное `::selection`: разные движки красят браузерное выделение по-разному
 * (по высоте строки или по рамке глифов), поэтому своя полоса не совпала бы с
 * нативной. Нативное выделение в EPUB делается прозрачным (см. `reader-document`)
 * и остаётся средством копирования. Полосы строк объединяются и обрезаются по
 * стыкам, поэтому метки встают по краям строки, а не повторяют дробные
 * прямоугольники диапазона.
 */

import { SELECTION_BAND_CLASS, SELECTION_LAYER_CLASS } from './reader-document';

/** Прямоугольник полосы в координатах документа книги. */
export interface SelectionBand {
  /** Отступ слева. */
  x: number;
  /** Отступ сверху. */
  y: number;
  /** Ширина. */
  width: number;
  /** Высота. */
  height: number;
}

/** Слияние прямоугольников строк набора в полосы.
 *
 * Прямоугольники сортируются по вертикали; куски одной строки объединяются, а
 * строка не заходит под предыдущую — на стыке не появляется двойная плотность.
 */
export function mergeLineBands(rects: SelectionBand[]): SelectionBand[] {
  const items = (rects ?? [])
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x);
  const lines: Array<{ top: number; bottom: number; x: number; right: number }> = [];
  for (const rect of items) {
    const line = lines[lines.length - 1];
    if (line) {
      const overlap =
        Math.min(line.bottom, rect.y + rect.height) - Math.max(line.top, rect.y);
      const minHeight = Math.min(line.bottom - line.top, rect.height);
      if (overlap > minHeight * 0.5) {
        line.top = Math.min(line.top, rect.y);
        line.bottom = Math.max(line.bottom, rect.y + rect.height);
        line.x = Math.min(line.x, rect.x);
        line.right = Math.max(line.right, rect.x + rect.width);
        continue;
      }
    }
    lines.push({
      top: rect.y,
      bottom: rect.y + rect.height,
      x: rect.x,
      right: rect.x + rect.width,
    });
  }
  const result: SelectionBand[] = [];
  for (const line of lines) {
    let top = line.top;
    if (result.length > 0) {
      const previous = result[result.length - 1];
      const previousBottom = previous.y + previous.height;
      if (top < previousBottom) {
        top = previousBottom;
      }
    }
    if (line.bottom > top) {
      result.push({
        x: line.x,
        y: top,
        width: line.right - line.x,
        height: line.bottom - top,
      });
    }
  }
  return result;
}

/** Высота строки текста в пикселях, если её удаётся получить из стиля. */
function resolveLineHeight(style: CSSStyleDeclaration | null): number | null {
  const value = style?.lineHeight;
  if (!value || value === 'normal') {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Сбор прямоугольников строк диапазона по его текстовым узлам.
 *
 * `Range.getClientRects()` для **целиком попавшего в выделение блочного элемента**
 * (абзаца) отдаёт его рамку во всю ширину области, а не строки текста: выделение
 * через абзацы давало широкую полосу с меткой в пустом месте. Поэтому
 * прямоугольники берутся по текстовым узлам: они строчные, и их полосы совпадают
 * со строками текста. Координаты переводятся в координаты документа, поэтому
 * полосы следуют за прокруткой.
 *
 * Прямоугольник текстового узла — рамка глифов, она ниже строки (`line-height`),
 * поэтому каждая полоса расширяется до высоты строки вокруг центра глифов: иначе
 * между строками выделения остаются пустоты, а у PDF их нет (там прямоугольники
 * текстового слоя уже включают межстрочный интервал). Соседние строки отстоят на
 * `line-height`, поэтому расширенные полосы стыкуются встык. Если `line-height`
 * не выражен числом (`normal`), полоса остаётся по рамке глифов.
 */
function collectSelectionRects(
  doc: Document,
  range: Range,
  scrollX: number,
  scrollY: number,
): SelectionBand[] {
  const rects: SelectionBand[] = [];
  const container = range.commonAncestorContainer;
  // 3 — текстовый узел: обход начинается с его родителя.
  const root = container.nodeType === 3 ? container.parentNode : container;
  if (!root) {
    return rects;
  }
  const view = doc.defaultView;
  const walker = doc.createTreeWalker(root, (view ? view.NodeFilter : NodeFilter).SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node)) {
      const text = node as Text;
      const start = text === range.startContainer ? range.startOffset : 0;
      const end = text === range.endContainer ? range.endOffset : text.length;
      if (end > start) {
        const sub = doc.createRange();
        sub.setStart(text, start);
        sub.setEnd(text, end);
        const lineHeight =
          view && text.parentElement
            ? resolveLineHeight(view.getComputedStyle(text.parentElement))
            : null;
        for (const bounds of Array.from(sub.getClientRects())) {
          if (bounds.width <= 0 || bounds.height <= 0) {
            continue;
          }
          const glyphHeight = bounds.height;
          const glyphTop = bounds.top + scrollY;
          const expanded = lineHeight !== null && lineHeight > glyphHeight;
          rects.push({
            x: bounds.left + scrollX,
            y: expanded ? glyphTop + glyphHeight / 2 - lineHeight / 2 : glyphTop,
            width: bounds.width,
            height: expanded ? lineHeight : glyphHeight,
          });
        }
      }
    }
    node = walker.nextNode();
  }
  return rects;
}

/** Снятие слоя активного выделения без изменения текста книги. */
export function clearSelectionLayer(doc: Document | null): void {
  for (const layer of Array.from(doc?.querySelectorAll(`.${SELECTION_LAYER_CLASS}`) ?? [])) {
    layer.remove();
  }
}

/** Отрисовка полос активного выделения и меток по их краям.
 *
 * Полосы строятся по текстовым узлам диапазона (см. `collectSelectionRects`).
 * Пустой или схлопнутый диапазон снимает слой.
 */
export function renderSelectionLayer(doc: Document | null, range: Range | null): void {
  clearSelectionLayer(doc);
  if (!doc || !range) {
    return;
  }
  const root = doc.scrollingElement ?? doc.documentElement;
  const scrollX = root?.scrollLeft ?? 0;
  const scrollY = root?.scrollTop ?? 0;
  const bands = mergeLineBands(collectSelectionRects(doc, range, scrollX, scrollY));
  if (bands.length === 0) {
    return;
  }
  const layer = doc.createElement('div');
  layer.className = SELECTION_LAYER_CLASS;
  layer.style.position = 'absolute';
  layer.style.left = '0';
  layer.style.top = '0';
  bands.forEach((band, index) => {
    const el = doc.createElement('div');
    el.className = SELECTION_BAND_CLASS;
    el.style.left = `${band.x}px`;
    el.style.top = `${band.y}px`;
    el.style.width = `${band.width}px`;
    el.style.height = `${band.height}px`;
    // Метки — только у краёв всего выделения: левая в его начале, правая в
    // конце. У промежуточных строк меток нет, иначе они читаются как отдельные
    // выделения (особенно при строках разной длины).
    const isStart = index === 0;
    const isEnd = index === bands.length - 1;
    el.dataset.edge = isStart && isEnd ? 'both' : isStart ? 'start' : isEnd ? 'end' : 'none';
    layer.append(el);
  });
  doc.documentElement.append(layer);
}
