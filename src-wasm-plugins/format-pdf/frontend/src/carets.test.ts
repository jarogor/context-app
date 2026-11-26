import { describe, expect, it } from 'vitest';

import { edgeRects, layerCaretAtPoint } from './carets';
import type { Rect } from './types';

/** Прямоугольник в долях страницы. */
function rect(x: number, y: number, width = 0.1, height = 0.05): Rect {
  return { x, y, width, height };
}

/** Текстовый слой со строкой из нескольких кусков, как в настоящем PDF.
 *
 * В слое pdf.js строка — не один `span`: куски даёт смена шрифта, кернинг и
 * отдельные пробелы. Геометрия задаётся явно: в jsdom раскладки нет.
 */
function layerWithPieces(pieces: Array<{ text: string; left: number; top: number }>): Element {
  const layer = document.createElement('div');
  layer.className = 'textLayer';
  for (const piece of pieces) {
    const span = document.createElement('span');
    span.textContent = piece.text;
    const left = piece.left;
    const top = piece.top;
    const width = piece.text.length * 10;
    span.getBoundingClientRect = () =>
      ({ left, top, right: left + width, bottom: top + 20, width, height: 20 }) as DOMRect;
    layer.append(span);
  }
  document.body.append(layer);
  return layer;
}

describe('layerCaretAtPoint', () => {
  it('ведёт позицию вдоль всей строки, а не внутри первого куска', () => {
    const layer = layerWithPieces([
      { text: 'The quick', left: 0, top: 0 },
      { text: 'brown fox', left: 90, top: 0 },
      { text: 'jumps over', left: 180, top: 0 },
    ]);
    // Точка в третьем куске: без сборки строки из кусков позиция оставалась бы
    // в первом куске и граница не шла дальше его конца.
    const caret = layerCaretAtPoint(layer, 260, 10);
    expect(caret?.node.data).toBe('jumps over');
    expect(caret?.offset).toBeGreaterThan(0);
    layer.remove();
  });

  it('конец за правым краем строки ставится в конец последнего куска', () => {
    const layer = layerWithPieces([
      { text: 'The quick', left: 0, top: 0 },
      { text: 'brown fox', left: 90, top: 0 },
    ]);
    const caret = layerCaretAtPoint(layer, 500, 10);
    expect(caret?.node.data).toBe('brown fox');
    expect(caret?.offset).toBe('brown fox'.length);
    layer.remove();
  });

  it('куски соседних строк не сливаются в одну строку', () => {
    const layer = layerWithPieces([
      { text: 'первая', left: 0, top: 0 },
      { text: 'вторая', left: 0, top: 40 },
    ]);
    const caret = layerCaretAtPoint(layer, 1, 45);
    expect(caret?.node.data).toBe('вторая');
    expect(caret?.inside).toBe(true);
    layer.remove();
  });

  it('в промежутке между строками помечает точку вне полосы строки', () => {
    const layer = layerWithPieces([
      { text: 'первая', left: 0, top: 0 },
      { text: 'вторая', left: 0, top: 40 },
    ]);
    const caret = layerCaretAtPoint(layer, 1, 30);
    expect(caret?.inside).toBe(false);
    layer.remove();
  });
});

describe('edgeRects', () => {
  it('берёт первый и последний прямоугольники по порядку чтения', () => {
    const edges = edgeRects([rect(0.5, 0.3), rect(0.1, 0.1), rect(0.2, 0.2)]);
    expect(edges?.first.y).toBe(0.1);
    expect(edges?.last.y).toBe(0.3);
  });

  it('при равной высоте упорядочивает по X', () => {
    const edges = edgeRects([rect(0.3, 0.1), rect(0.1, 0.1)]);
    expect(edges?.first.x).toBe(0.1);
    expect(edges?.last.x).toBe(0.3);
  });

  it('пустой вход и отсутствие прямоугольников дают null', () => {
    expect(edgeRects([])).toBeNull();
    expect(edgeRects(null)).toBeNull();
    expect(edgeRects(undefined)).toBeNull();
  });

  it('не изменяет исходный массив', () => {
    const rects = [rect(0.5, 0.3), rect(0.1, 0.1)];
    edgeRects(rects);
    expect(rects[0].y).toBe(0.3);
  });
});
