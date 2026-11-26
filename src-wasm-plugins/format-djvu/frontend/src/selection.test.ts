import { describe, expect, it } from 'vitest';

import { fractionRect, selectionRects } from './selection';

/** Рамка с заданными полями. */
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

describe('fractionRect', () => {
  it('переводит рамку в доли страницы', () => {
    const value = fractionRect(rect(50, 100, 100, 20), rect(0, 0, 200, 400));
    expect(value).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.05 });
  });
});

describe('selectionRects', () => {
  it('не отнимает у слова хвостовой пробел зоны', () => {
    // Дефект: ширина слова делилась на полную длину текста, включая пробел,
    // который `buildTextLayer` добавляет к каждой зоне. Двойной клик выделяет
    // слово без пробела, и рамка выходила короче видимого слова на долю
    // пробела — на полбуквы-букву.
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    const span = document.createElement('span');
    span.textContent = 'Хайдеггер ';
    layer.append(span);
    document.body.append(layer);
    Object.defineProperty(span, 'getBoundingClientRect', {
      value: () => rect(100, 10, 90, 20),
    });
    const text = span.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 9);
    Object.defineProperty(range, 'commonAncestorContainer', { value: layer });
    Object.defineProperty(range, 'intersectsNode', { value: () => true });
    Object.defineProperty(range, 'getClientRects', { value: () => [] });
    try {
      const rects = selectionRects(range, rect(0, 0, 1000, 1000));
      // Куски текстового узла и спана могут дублироваться — важно, что рамка
      // слова не короче его ширины.
      expect(rects.length).toBeGreaterThan(0);
      const widest = rects.reduce((a, b) => (b.width > a.width ? b : a));
      expect(widest.width).toBeCloseTo(0.09, 5);
      expect(widest.x).toBeCloseTo(0.1, 5);
    } finally {
      layer.remove();
    }
  });
});
