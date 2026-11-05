import { describe, expect, it } from 'vitest';
import { canStepPage, clampPage, pageProgress } from './page-state';

describe('прогресс страницы', () => {
  it('первая страница даёт ноль, последняя — сто', () => {
    expect(pageProgress(1, 10)).toBe(0);
    expect(pageProgress(10, 10)).toBe(100);
  });

  it('середина распределена линейно', () => {
    expect(pageProgress(2, 3)).toBeCloseTo(50);
  });

  it('одна страница или нечисло дают ноль', () => {
    expect(pageProgress(1, 1)).toBe(0);
    expect(pageProgress(Number.NaN, 10)).toBe(0);
  });
});

describe('границы страницы', () => {
  it('ограничивает снизу и сверху', () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
  });

  it('без известного числа страниц только нижняя граница', () => {
    expect(clampPage(7, null)).toBe(7);
    expect(clampPage(-2, null)).toBe(1);
  });

  it('шаг разрешён только в пределах', () => {
    expect(canStepPage(3, 5, 1)).toBe(true);
    expect(canStepPage(5, 5, 1)).toBe(false);
    expect(canStepPage(1, 5, -1)).toBe(false);
    expect(canStepPage(null, 5, 1)).toBe(false);
    expect(canStepPage(3, null, 1)).toBe(true);
  });
});
