import { describe, expect, it } from 'vitest';

import { bandStyle, fillBands, mergeLineBands } from './index';

/** Полоса в координатах документа. */
function band(x: number, y: number, width: number, height: number, block = 0) {
  return { x, y, width, height, block };
}

/** Оформление для проверки. */
const STYLE = { fill: 'rgba(1, 2, 3, 0.3)', edge: 'rgba(4, 5, 6, 0.9)', edgeWidth: 2 };

describe('слияние полос выделения', () => {
  it('доводит строку до верха следующей строки того же блока', () => {
    // Заливка закрывает межстрочный промежуток: строка выделения выше рамки
    // букв, иначе обводка края короче нарисованной заливки.
    const bands = mergeLineBands([band(10, 100, 200, 17), band(10, 125.6, 200, 17)]);
    expect(bands).toHaveLength(2);
    expect(bands[0].height).toBeCloseTo(25.6, 5);
    expect(bands[1].y).toBeCloseTo(125.6, 5);
  });

  it('не сшивает строки разных блоков', () => {
    // Между абзацами заливки нет: отступ остаётся чистым.
    const bands = mergeLineBands([band(10, 100, 200, 17, 0), band(10, 148, 200, 17, 1)]);
    expect(bands).toHaveLength(2);
    expect(bands[0].y + bands[0].height).toBeCloseTo(117, 5);
    expect(bands[1].y).toBe(148);
  });
});

describe('оформление полосы', () => {
  it('ставит заливку и обводку на один элемент', () => {
    // Обводка — внутренняя тень самой полосы: её высота равна высоте полосы,
    // поэтому обводка и заливка не могут разойтись.
    expect(bandStyle(STYLE, 'start')).toContain('background:rgba(1, 2, 3, 0.3)');
    expect(bandStyle(STYLE, 'start')).toContain('inset 2px 0 0 0 rgba(4, 5, 6, 0.9)');
    expect(bandStyle(STYLE, 'end')).toContain('inset calc(-1 * 2px) 0 0 0');
    expect(bandStyle(STYLE, 'both')).toContain('inset 2px 0 0 0');
    expect(bandStyle(STYLE, 'both')).toContain('inset calc(-1 * 2px) 0 0 0');
    // У промежуточной строки обводки нет, заливка есть.
    expect(bandStyle(STYLE, 'none')).toBe('background:rgba(1, 2, 3, 0.3);');
  });

  it('высота обводки равна высоте полосы', () => {
    const layer = document.createElement('div');
    fillBands(
      layer,
      [band(10, 20, 100, 40), band(10, 60, 100, 25)],
      STYLE,
      (value) => ({
        left: `${value.x}px`,
        top: `${value.y}px`,
        width: `${value.width}px`,
        height: `${value.height}px`,
      }),
    );
    const bands = layer.querySelectorAll<HTMLElement>('.context-selection-band');
    expect(bands).toHaveLength(2);
    // Обводка — тень элемента, у которого своя высота: подгонять нечего.
    expect(bands[0].dataset.edge).toBe('start');
    expect(bands[0].style.height).toBe('40px');
    expect(bands[0].style.boxShadow).toContain('inset');
    expect(bands[1].dataset.edge).toBe('end');
    expect(bands[1].style.height).toBe('25px');
  });

  it('не ставит обводку промежуточным полосам', () => {
    const layer = document.createElement('div');
    fillBands(
      layer,
      [band(10, 0, 100, 20), band(10, 20, 100, 20), band(10, 40, 100, 20)],
      STYLE,
      (value) => ({
        left: `${value.x}px`,
        top: `${value.y}px`,
        width: `${value.width}px`,
        height: `${value.height}px`,
      }),
    );
    const bands = layer.querySelectorAll<HTMLElement>('.context-selection-band');
    expect(bands[1].dataset.edge).toBe('none');
    expect(bands[1].style.boxShadow).toBe('');
  });
});
