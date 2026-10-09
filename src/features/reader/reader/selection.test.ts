import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearSelectionLayer,
  mergeLineBands,
  renderSelectionLayer,
  type SelectionBand,
} from './selection';
import { SELECTION_BAND_CLASS, SELECTION_LAYER_CLASS } from './reader-document';

/** Прямоугольник диапазона в координатах окна. */
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Мок `Range.getClientRects`: вызовы по кругу отдают заданные прямоугольники.
 *
 * В jsdom метода нет, поэтому свойство задаётся напрямую, а не через `spyOn`.
 * Набор зациклен, чтобы повторная отрисовка получала те же полосы.
 */
function mockRects(rects: DOMRect[]): void {
  let index = 0;
  const original = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    writable: true,
    value: () => {
      const next = rects[index % rects.length];
      index += 1;
      return (next ? [next] : []) as unknown as DOMRectList;
    },
  });
  mocks.push(() => {
    if (original) {
      Object.defineProperty(Range.prototype, 'getClientRects', original);
    } else {
      delete (Range.prototype as unknown as { getClientRects?: unknown }).getClientRects;
    }
  });
}

/** Восстановители моков, снятые после каждого теста. */
const mocks: Array<() => void> = [];

/** Разметка с абзацами для выделения. */
function mountParagraphs(texts: string[]): HTMLElement {
  document.body.innerHTML = texts.map((text) => `<p>${text}</p>`).join('');
  document.documentElement
    .querySelectorAll(`.${SELECTION_LAYER_CLASS}`)
    .forEach((layer) => layer.remove());
  return document.body;
}

/** Диапазон от начала первого абзаца до конца указанного. */
function selectParagraphs(body: HTMLElement, to: number): Range {
  const paragraphs = Array.from(body.querySelectorAll('p'));
  const startNode = paragraphs[0].firstChild as Text;
  const endNode = paragraphs[to].firstChild as Text;
  const range = document.createRange();
  range.setStart(startNode, 0);
  range.setEnd(endNode, endNode.textContent?.length ?? 0);
  return range;
}

afterEach(() => {
  mocks.splice(0).forEach((restore) => restore());
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.documentElement
    .querySelectorAll(`.${SELECTION_LAYER_CLASS}`)
    .forEach((layer) => layer.remove());
});

describe('mergeLineBands', () => {
  it('сливает куски одной строки и обрезает наложение на предыдущую', () => {
    const bands = mergeLineBands([
      { x: 0, y: 0, width: 50, height: 10 },
      { x: 50, y: 0, width: 50, height: 10 },
      // Вторая строка заходит под первую на 4px — подрезается.
      { x: 0, y: 6, width: 100, height: 10 },
    ]);
    expect(bands).toHaveLength(2);
    expect(bands[0]).toMatchObject({ x: 0, y: 0, width: 100, height: 10 });
    expect(bands[1].y).toBe(10);
    expect(bands[1].height).toBe(6);
  });

  it('игнорирует пустые прямоугольники', () => {
    expect(mergeLineBands([{ x: 0, y: 0, width: 0, height: 10 }])).toEqual([]);
  });
});

describe('слой активного выделения', () => {
  it('рисует полосы и снимает прежний слой', () => {
    const body = mountParagraphs(['Первый абзац', 'Второй абзац']);
    mockRects([rect(10, 20, 100, 12), rect(10, 34, 80, 12)]);

    renderSelectionLayer(document, selectParagraphs(body, 1));

    const layers = document.querySelectorAll(`.${SELECTION_LAYER_CLASS}`);
    expect(layers).toHaveLength(1);
    const bands = layers[0].querySelectorAll(`.${SELECTION_BAND_CLASS}`);
    expect(bands).toHaveLength(2);
    // Полосы позиционируются в координатах документа.
    const first = bands[0] as HTMLElement;
    expect(first.style.left).toBe('10px');
    expect(first.style.top).toBe('20px');
    expect(first.style.width).toBe('100px');
    // Метки — у краёв всего выделения: у первой полосы только левая, у
    // последней только правая, у промежуточных полос меток нет.
    expect(first.dataset.edge).toBe('start');
    expect((bands[1] as HTMLElement).dataset.edge).toBe('end');

    // Повторная отрисовка не плодит слои.
    renderSelectionLayer(document, selectParagraphs(body, 1));
    expect(document.querySelectorAll(`.${SELECTION_LAYER_CLASS}`)).toHaveLength(1);

    clearSelectionLayer(document);
    expect(document.querySelectorAll(`.${SELECTION_LAYER_CLASS}`)).toHaveLength(0);
  });

  it('промежуточные строки выделения не получают собственных меток', () => {
    const body = mountParagraphs(['Первая', 'Вторая', 'Третья']);
    mockRects([rect(0, 0, 60, 10), rect(0, 14, 60, 10), rect(0, 28, 60, 10)]);

    renderSelectionLayer(document, selectParagraphs(body, 2));

    const edges = Array.from(
      document.querySelectorAll(`.${SELECTION_BAND_CLASS}`),
    ).map((band) => (band as HTMLElement).dataset.edge);
    expect(edges).toEqual(['start', 'none', 'end']);
  });

  it('схлопнутый диапазон снимает слой', () => {
    const body = mountParagraphs(['Абзац']);
    mockRects([rect(0, 0, 10, 10)]);
    renderSelectionLayer(document, selectParagraphs(body, 0));
    expect(document.querySelectorAll(`.${SELECTION_LAYER_CLASS}`)).toHaveLength(1);

    renderSelectionLayer(document, null);
    expect(document.querySelectorAll(`.${SELECTION_LAYER_CLASS}`)).toHaveLength(0);
  });
});

describe('типы слоя', () => {
  it('полоса описывается координатами и размером', () => {
    const band: SelectionBand = { x: 1, y: 2, width: 3, height: 4 };
    expect(band).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});
