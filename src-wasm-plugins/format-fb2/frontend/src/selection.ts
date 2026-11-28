/** Слой активного выделения текста во встроенном чтении FB2.
 *
 * Полосы и обводку их краёв рисует общий слой выделения (`@context/selection`) —
 * тот же, что во всех модулях рисования. Заливка и обводка лежат на одном
 * элементе, поэтому их высота совпадает по построению.
 *
 * Нативное `::selection` остаётся средством копирования и не красится: его
 * заливка шла от движка, своим прямоугольником, и не совпадала с полосой слоя.
 */

import {
  clearSelectionLayer,
  mergeLineBands,
  renderSelectionLayer,
  type SelectionBand,
  type SelectionStyle,
} from '@context/selection';

export { clearSelectionLayer, mergeLineBands };
export type { SelectionBand };

/** Оформление выделения книги из токенов читалки. */
export function selectionStyleOf(tokens: {
  /** Заливка выделения. */
  selection?: string;
  /** Цвет обводки краёв. */
  selectionEdge?: string;
  /** Толщина обводки в пикселях. */
  selectionEdgeWidth?: number;
}): SelectionStyle {
  return {
    fill: tokens.selection ?? 'rgba(96, 140, 180, 0.32)',
    edge: tokens.selectionEdge ?? 'rgba(60, 100, 145, 0.9)',
    edgeWidth: tokens.selectionEdgeWidth ?? 1,
  };
}

/** Отрисовка полос активного выделения и обводки их краёв.
 *
 * Полосы строятся по текстовым узлам диапазона. Пустой или схлопнутый диапазон
 * снимает слой.
 */
export function renderSelection(
  doc: Document | null,
  range: Range | null,
  style: SelectionStyle,
): void {
  renderSelectionLayer(doc, range, style);
}
