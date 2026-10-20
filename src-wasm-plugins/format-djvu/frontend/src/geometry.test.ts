import { describe, expect, it } from 'vitest';

import { parseGeometry, shapeElement, shapeHitElement, shapeHitPath, shiftGeometry } from './geometry';

describe('parseGeometry', () => {
  it('разбирает две точки в долях страницы', () => {
    expect(parseGeometry('{"x1":0.1,"y1":0.2,"x2":0.3,"y2":0.4}')).toEqual({
      x1: 0.1,
      y1: 0.2,
      x2: 0.3,
      y2: 0.4,
    });
  });

  it('отбрасывает повреждённую и неполную геометрию', () => {
    expect(parseGeometry('{')).toBeNull();
    expect(parseGeometry('')).toBeNull();
    expect(parseGeometry('{"x1":0.1}')).toBeNull();
    expect(parseGeometry('{"x1":"a","y1":0,"x2":0,"y2":0}')).toBeNull();
  });
});

describe('shapeElement', () => {
  it('строит прямоугольник по границам', () => {
    const rect = shapeElement('rectangle', { x1: 0.5, y1: 0.6, x2: 0.1, y2: 0.2 });
    expect(rect.tagName.toLowerCase()).toBe('rect');
    expect(rect.getAttribute('x')).toBe('0.1');
    expect(rect.getAttribute('y')).toBe('0.2');
    expect(Number(rect.getAttribute('width'))).toBeCloseTo(0.4);
    expect(Number(rect.getAttribute('height'))).toBeCloseTo(0.4);
  });

  it('строит эллипс по центру и радиусам', () => {
    const ellipse = shapeElement('ellipse', { x1: 0, y1: 0, x2: 0.4, y2: 0.2 });
    expect(ellipse.tagName.toLowerCase()).toBe('ellipse');
    expect(ellipse.getAttribute('cx')).toBe('0.2');
    expect(ellipse.getAttribute('ry')).toBe('0.1');
  });

  it('строит линию по двум точкам', () => {
    const line = shapeElement('line', { x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 });
    expect(line.tagName.toLowerCase()).toBe('line');
    expect(line.getAttribute('x2')).toBe('0.3');
  });
});

describe('shapeHitPath', () => {
  it('замкнутый контур для прямоугольника', () => {
    expect(shapeHitPath('rectangle', { x1: 0, y1: 0, x2: 1, y2: 1 })).toBe('M0 0H1V1H0Z');
  });

  it('открытая линия для линии', () => {
    expect(shapeHitPath('line', { x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 })).toBe('M0.1 0.2L0.3 0.4');
  });
});

describe('shapeHitElement', () => {
  it('строит прозрачную мишень типа path', () => {
    const hit = shapeHitElement('line', { x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(hit.tagName.toLowerCase()).toBe('path');
    expect(hit.getAttribute('d')).toBe('M0 0L1 1');
  });
});

describe('shiftGeometry', () => {
  it('сдвигает все точки и зажимает в долях страницы', () => {
    const shifted = shiftGeometry({ x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.6 }, 0.1, -0.5);
    expect(shifted.x1).toBeCloseTo(0.2);
    expect(shifted.y1).toBe(0);
    expect(shifted.x2).toBeCloseTo(0.6);
    expect(shifted.y2).toBeCloseTo(0.1);
  });
});
