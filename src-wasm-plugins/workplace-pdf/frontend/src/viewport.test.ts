import { describe, expect, it } from 'vitest';

import {
  MAX_CANVAS_AREA,
  MAX_CANVAS_SIDE,
  boundedRatio,
  currentScale,
  desiredWindow,
  displayRatio,
  fitsWholePage,
  snapToDevice,
} from './viewport';

describe('currentScale', () => {
  it('100 % — естественный размер страницы', () => {
    expect(currentScale(100)).toBeCloseTo(96 / 72);
    expect(currentScale(200)).toBeCloseTo((96 / 72) * 2);
  });
});

describe('displayRatio', () => {
  it('не превышает предел и подставляет единицу без плотности', () => {
    expect(displayRatio(3)).toBe(2.5);
    expect(displayRatio(0)).toBe(1);
    expect(displayRatio(1.5)).toBe(1.5);
  });
});

describe('boundedRatio', () => {
  it('ограничивает плотность пределом стороны', () => {
    const ratio = boundedRatio(MAX_CANVAS_SIDE, 10, 2.5);
    expect(ratio).toBeLessThanOrEqual(MAX_CANVAS_SIDE / MAX_CANVAS_SIDE);
    expect(ratio).toBeGreaterThan(0);
  });

  it('ограничивает плотность пределом площади', () => {
    const side = Math.sqrt(MAX_CANVAS_AREA);
    const ratio = boundedRatio(side, side, 2.5);
    expect(side * side * ratio * ratio).toBeLessThanOrEqual(MAX_CANVAS_AREA + 1);
  });

  it('не опускается ниже четверти', () => {
    expect(boundedRatio(1e9, 1e9, 2.5)).toBeGreaterThanOrEqual(0.25);
  });
});

describe('snapToDevice', () => {
  it('округляет до целого физического пикселя', () => {
    expect(snapToDevice(10.4, 2)).toBe(10.5);
    expect(snapToDevice(10.6, 2)).toBe(10.5);
    expect(snapToDevice(10.3, 1)).toBe(10);
  });
});

describe('fitsWholePage', () => {
  it('мелкая страница помещается, гигантская — нет', () => {
    expect(fitsWholePage({ width: 612, height: 792 }, 2)).toBe(true);
    expect(fitsWholePage({ width: MAX_CANVAS_SIDE * 2, height: 10 }, 2)).toBe(false);
  });
});

describe('desiredWindow', () => {
  it('возвращает всю страницу, когда она помещается', () => {
    const window = desiredWindow(
      { left: 0, top: 0 },
      { left: 0, top: 0 },
      { width: 800, height: 600 },
      { width: 612, height: 792 },
      2,
    );
    expect(window).toEqual({ x0: 0, y0: 0, width: 612, height: 792 });
  });

  it('вырезает окно видимой области с запасом при сильном увеличении', () => {
    const viewport = { width: 4000, height: 6000 };
    const window = desiredWindow(
      { left: 0, top: 0 },
      { left: 0, top: 1000 },
      { width: 800, height: 600 },
      viewport,
      2,
    );
    // y0 = 1000 - 512 = 488, высота = 600 + 1024 = 1624.
    expect(window.y0).toBe(488);
    expect(window.height).toBe(1624);
    expect(window.width).toBeGreaterThanOrEqual(128);
  });

  it('держит окно в пределах страницы', () => {
    const viewport = { width: 1000, height: 1000 };
    const window = desiredWindow(
      { left: 0, top: 0 },
      { left: 0, top: 0 },
      { width: 100000, height: 100000 },
      viewport,
      2,
    );
    expect(window.x0).toBe(0);
    expect(window.y0).toBe(0);
    expect(window.width).toBe(1000);
    expect(window.height).toBe(1000);
  });
});
