import { describe, expect, it } from 'vitest';

import { edgeRects } from './carets';
import type { Rect } from './types';

/** Прямоугольник в долях страницы. */
function rect(x: number, y: number, width = 0.1, height = 0.05): Rect {
  return { x, y, width, height };
}

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
