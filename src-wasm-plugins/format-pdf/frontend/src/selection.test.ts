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
  it('пропускает пустые прямоугольники диапазона', () => {
    const page = rect(0, 0, 200, 400);
    const range = {
      getClientRects: () => [rect(0, 0, 0, 20), rect(20, 40, 100, 20)],
    } as unknown as Range;
    const rects = selectionRects(range, page);
    // Нулевой по ширине прямоугольник не даёт полосы: иначе на странице
    // появлялась бы заливка без текста.
    expect(rects).toEqual([{ x: 0.1, y: 0.1, width: 0.5, height: 0.05 }]);
  });
});
