/** Слой выделения текста, общий для всех модулей рисования.
 *
 * Выделение рисуется одним прямоугольником на строку. Заливка и обводка краёв
 * лежат на **одном** элементе, поэтому разойтись по высоте им нечем: раньше
 * заливку давало нативное `::selection` (или растр страницы), а метку —
 * отдельный элемент, и два источника координат давали разную высоту на каждой
 * правке.
 *
 * Обводка ставится только крайним полосам выделения: левая в его начале, правая
 * в конце. У промежуточных строк обводки нет, иначе они читаются как отдельные
 * выделения (особенно при строках разной длины).
 */

/** Класс слоя выделения. */
export const SELECTION_LAYER_CLASS = 'context-selection-layer';
/** Класс полосы выделения. */
export const SELECTION_BAND_CLASS = 'context-selection-band';

/** Прямоугольник полосы в координатах документа. */
export interface SelectionBand {
  /** Отступ слева. */
  x: number;
  /** Отступ сверху. */
  y: number;
  /** Ширина. */
  width: number;
  /** Высота. */
  height: number;
  /** Блок, которому принадлежит строка: строки разных блоков не сшиваются. */
  block?: number;
}

/** Оформление слоя: значения подставляет модуль рисования своими токенами. */
export interface SelectionStyle {
  /** Заливка выделения: `transparent`, если её рисует растр страницы. */
  fill: string;
  /** Цвет обводки краёв. */
  edge: string;
  /** Толщина обводки в пикселях. */
  edgeWidth: number;
}

/** Слияние прямоугольников строк в полосы.
 *
 * Прямоугольники сортируются по вертикали; куски одной строки объединяются, а
 * строка не заходит под предыдущую — на стыке не появляется двойная плотность.
 */
export function mergeLineBands(rects: SelectionBand[]): SelectionBand[] {
  const items = (rects ?? [])
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x);
  const lines: Array<{
    top: number;
    bottom: number;
    x: number;
    right: number;
    block: number | undefined;
  }> = [];
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
      block: rect.block,
    });
  }
  const result: SelectionBand[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previous = result[result.length - 1];
    // Стык идёт по низу предыдущей полосы: на наложении строк двойной плотности
    // нет, а промежуток между строками остаётся закрытым.
    const top = previous ? Math.max(line.top, previous.y + previous.height) : line.top;
    /* Низ полосы — верх следующей строки того же блока: `::selection`
       закрашивает межстрочный промежуток, и строка выделения выше рамки букв.
       Замер в живом окне на реальной книге: первая строка полосы занимала
       333.6…350.6 (рамка букв), а заливка той же строки — 333.6…358.6, до верха
       следующей строки. Между блоками заливки нет: у абзаца отступ остаётся
       чистым, поэтому низ последней строки блока — рамка её букв. */
    const next = lines[index + 1];
    const sameBlock =
      next !== undefined && line.block !== undefined && next.block === line.block;
    const bottom = sameBlock ? Math.max(line.bottom, next.top) : line.bottom;
    if (bottom > top) {
      result.push({
        x: line.x,
        y: top,
        width: line.right - line.x,
        height: bottom - top,
        block: line.block,
      });
    }
  }
  return result;
}

/** Прямоугольники строк диапазона по его текстовым узлам.
 *
 * `Range.getClientRects()` для целиком попавшего в выделение блочного элемента
 * отдаёт его рамку во всю ширину области, а не строки текста. Поэтому
 * прямоугольники берутся по текстовым узлам: они строчные, и их полосы совпадают
 * со строками текста. `block` отличает строки соседних блоков: между абзацами
 * заливки нет, и сшивать их полосы нельзя.
 */
export function collectRangeRects(
  doc: Document,
  range: Range,
  offsetX = 0,
  offsetY = 0,
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
  const blocks = new Map<Element, number>();
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
        const blockEl = blockOf(text);
        if (!blocks.has(blockEl)) {
          blocks.set(blockEl, blocks.size);
        }
        const block = blocks.get(blockEl) ?? 0;
        for (const bounds of Array.from(sub.getClientRects())) {
          if (bounds.width <= 0 || bounds.height <= 0) {
            continue;
          }
          rects.push({
            x: bounds.left + offsetX,
            y: bounds.top + offsetY,
            width: bounds.width,
            height: bounds.height,
            block,
          });
        }
      }
    }
    node = walker.nextNode();
  }
  return rects;
}

/** Блок строки: ближайший предок, который занимает свою полосу в наборе.
 *
 * Строки одного блока сшиваются, строки разных — нет: заливка закрывает
 * межстрочный промежуток внутри абзаца, но не отступ между абзацами.
 */
export function blockOf(node: Node): Element {
  let element = node.parentElement;
  const view = node.ownerDocument?.defaultView;
  const isBlock = (value: Element): boolean => {
    const display = view ? view.getComputedStyle(value).display : '';
    return display !== 'inline' && display !== 'inline-block' && display !== 'contents';
  };
  while (element && element.parentElement && !isBlock(element)) {
    element = element.parentElement;
  }
  return element ?? node.parentElement ?? (node.ownerDocument?.documentElement as Element);
}

/** Оформление полосы: заливка и обводка одним элементом. */
export function bandStyle(style: SelectionStyle, edge: string): string {
  const width = `${style.edgeWidth}px`;
  const line = `${width} 0 0 0 ${style.edge}`;
  if (edge === 'start') {
    return `background:${style.fill};box-shadow:inset ${line};`;
  }
  if (edge === 'end') {
    return `background:${style.fill};box-shadow:inset calc(-1 * ${width}) 0 0 0 ${style.edge};`;
  }
  if (edge === 'both') {
    return `background:${style.fill};box-shadow:inset ${line},inset calc(-1 * ${width}) 0 0 0 ${style.edge};`;
  }
  return `background:${style.fill};`;
}

/** Снятие слоя выделения без изменения текста книги. */
export function clearSelectionLayer(doc: Document | null): void {
  for (const layer of Array.from(doc?.querySelectorAll(`.${SELECTION_LAYER_CLASS}`) ?? [])) {
    layer.remove();
  }
}

/** Отрисовка полос выделения и обводки их краёв.
 *
 * Полосы строятся по текстовым узлам диапазона (см. `collectRangeRects`).
 * Пустой или схлопнутый диапазон снимает слой.
 */
export function renderSelectionLayer(
  doc: Document | null,
  range: Range | null,
  style: SelectionStyle,
): void {
  clearSelectionLayer(doc);
  if (!doc || !range) {
    return;
  }
  const root = doc.scrollingElement ?? doc.documentElement;
  const scrollX = root?.scrollLeft ?? 0;
  const scrollY = root?.scrollTop ?? 0;
  const bands = mergeLineBands(collectRangeRects(doc, range, scrollX, scrollY));
  if (bands.length === 0) {
    return;
  }
  const layer = doc.createElement('div');
  layer.className = SELECTION_LAYER_CLASS;
  layer.style.position = 'absolute';
  layer.style.left = '0';
  layer.style.top = '0';
  layer.style.pointerEvents = 'none';
  fillBands(layer, bands, style, (band) => ({
    left: `${band.x}px`,
    top: `${band.y}px`,
    width: `${band.width}px`,
    height: `${band.height}px`,
  }));
  doc.documentElement.append(layer);
}

/** Раскладка полос в готовом слое.
 *
 * Заливка и обводка ставятся на один элемент, поэтому их высота и положение
 * берутся из одного прямоугольника и разойтись не могут. `toCss` переводит
 * полосу в позицию элемента: у страничных форматов это доли страницы, у
 * текстовых — координаты документа.
 */
export function fillBands(
  layer: HTMLElement,
  bands: SelectionBand[],
  style: SelectionStyle,
  toCss: (band: SelectionBand) => {
    /** Смещение слева. */
    left: string;
    /** Смещение сверху. */
    top: string;
    /** Ширина. */
    width: string;
    /** Высота. */
    height: string;
  },
): void {
  layer.replaceChildren();
  bands.forEach((band, index) => {
    const doc = layer.ownerDocument;
    const el = doc.createElement('div');
    el.className = SELECTION_BAND_CLASS;
    const css = toCss(band);
    el.style.left = css.left;
    el.style.top = css.top;
    el.style.width = css.width;
    el.style.height = css.height;
    const isStart = index === 0;
    const isEnd = index === bands.length - 1;
    const edge = isStart && isEnd ? 'both' : isStart ? 'start' : isEnd ? 'end' : 'none';
    el.dataset.edge = edge;
    el.style.cssText += bandStyle(style, edge);
    layer.append(el);
  });
}
