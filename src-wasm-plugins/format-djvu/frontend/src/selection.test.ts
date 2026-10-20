import { describe, expect, it } from 'vitest';

import { applyFillMask, fractionRect } from './selection';
import type { Rect } from './types';

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

describe('applyFillMask', () => {
  it('строит единую маску по прямоугольникам в долях страницы', () => {
    const fill = document.createElement('div');
    const rects: Rect[] = [
      { x: 0, y: 0, width: 0.5, height: 0.1 },
      { x: 0, y: 0.1, width: 0.5, height: 0.1 },
    ];
    const id = applyFillMask(fill, rects, 7);
    expect(id).toBe('selection-clip-7');
    // jsdom сериализует значение с кавычками; важен сам адрес маски.
    expect(fill.style.clipPath).toContain('selection-clip-7');
    const clip = fill.querySelector('clipPath');
    expect(clip?.getAttribute('clipPathUnits')).toBe('objectBoundingBox');
    expect(clip?.querySelector('path')?.getAttribute('d')).toBe(
      'M0 0h0.5v0.1h-0.5Z M0 0.1h0.5v0.1h-0.5Z',
    );
  });
});
