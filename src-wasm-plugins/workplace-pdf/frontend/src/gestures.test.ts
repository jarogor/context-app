import { describe, expect, it } from 'vitest';

import { pointFraction } from './gestures';

/** Страница с подменённой геометрией (jsdom не считает раскладку). */
function pageWithRect(left: number, top: number, width: number, height: number): HTMLElement {
  const pageEl = document.createElement('div');
  pageEl.className = 'page';
  pageEl.getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
  return pageEl;
}

describe('pointFraction', () => {
  it('переводит координаты указателя в доли страницы', () => {
    const pageEl = pageWithRect(100, 50, 400, 200);
    expect(pointFraction(pageEl, 300, 150)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('зажимает точку краями страницы', () => {
    const pageEl = pageWithRect(0, 0, 100, 100);
    expect(pointFraction(pageEl, -20, 200)).toEqual({ x: 0, y: 1 });
  });

  it('страница без размера даёт левый верхний угол', () => {
    expect(pointFraction(pageWithRect(0, 0, 0, 0), 10, 10)).toEqual({ x: 0, y: 0 });
  });
});
