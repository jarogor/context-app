import { describe, expect, it } from 'vitest';
import { clamp01, pointFraction, rangeHandleRect } from './geometry';

/** Элемент с заданным прямоугольником для проверки долей точки. */
function stubSection(rect: { left: number; top: number; width: number; height: number }): Element {
  const element = document.createElement('section');
  element.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return element;
}

describe('геометрия чтения: доли и границы', () => {
  it('ограничивает долю диапазоном [0, 1]', () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(9)).toBe(1);
  });

  it('считает доли точки внутри раздела', () => {
    const section = stubSection({ left: 100, top: 200, width: 200, height: 400 });
    expect(pointFraction(section, 200, 400)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('обрезает точку вне раздела к его краям', () => {
    const section = stubSection({ left: 100, top: 200, width: 200, height: 400 });
    expect(pointFraction(section, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(pointFraction(section, 9999, 9999)).toEqual({ x: 1, y: 1 });
  });

  it('возвращает null для пустого диапазона границ', () => {
    const section = stubSection({ left: 0, top: 0, width: 100, height: 100 });
    expect(rangeHandleRect(section, null, 'start')).toBeNull();
  });
});
