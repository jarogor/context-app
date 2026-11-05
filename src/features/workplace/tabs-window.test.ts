import { describe, expect, it } from 'vitest';
import { clampWindowStart, visibleTabCount, windowStartForActive } from './tabs-window';

describe('ёмкость окна вкладок по ширине', () => {
  it('считает число целиком помещающихся вкладок', () => {
    expect(visibleTabCount(1000, 100)).toBe(10);
    expect(visibleTabCount(950, 100)).toBe(9);
  });

  it('оставляет минимум одну вкладку в узкой панели', () => {
    expect(visibleTabCount(30, 100)).toBe(1);
    expect(visibleTabCount(0, 100)).toBe(1);
  });

  it('не делит на неположительную ширину вкладки', () => {
    expect(visibleTabCount(500, 0)).toBe(1);
    expect(visibleTabCount(500, Number.NaN)).toBe(1);
  });
});

describe('границы окна вкладок', () => {
  it('не пускает начало окна за пределы списка', () => {
    expect(clampWindowStart(-3, 3, 7)).toBe(0);
    expect(clampWindowStart(99, 3, 7)).toBe(4);
  });

  it('при пустом списке начало окна равно нулю', () => {
    expect(clampWindowStart(2, 3, 0)).toBe(0);
  });

  it('сдвигает окно минимально, чтобы показать активную вкладку справа', () => {
    expect(windowStartForActive(6, 0, 3, 7)).toBe(4);
    expect(windowStartForActive(3, 0, 3, 7)).toBe(1);
  });

  it('сдвигает окно минимально, чтобы показать активную вкладку слева', () => {
    expect(windowStartForActive(0, 4, 3, 7)).toBe(0);
  });

  it('не меняет окно, если активная вкладка уже видна', () => {
    expect(windowStartForActive(4, 3, 3, 7)).toBe(3);
  });
});
