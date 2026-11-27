import { describe, expect, it } from 'vitest';

import { mergeLineBands } from './selection';

/** Полоса в координатах документа книги. */
function band(x: number, y: number, width: number, height: number) {
  return { x, y, width, height };
}

describe('слияние полос выделения', () => {
  it('заполняет промежуток между строками до низа предыдущей', () => {
    /* Строки идут через 25.6 px, буквы занимают 17: `::selection` в WebKit
       закрашивает и промежуток между строками, поэтому полоса второй строки
       обязана начинаться с низа первой. Иначе метка по краю стоит внутри
       нарисованного выделения и читается съехавшей вниз. */
    const bands = mergeLineBands([band(50, 100, 200, 17), band(50, 125.6, 200, 17)]);
    expect(bands).toHaveLength(2);
    expect(bands[0].y).toBe(100);
    expect(bands[1].y).toBe(117);
    expect(bands[1].y + bands[1].height).toBeCloseTo(142.6, 5);
  });

  it('не тянет полосу через отступ между абзацами', () => {
    // Между абзацами отступ вдвое больше строки, и заливка его не красит:
    // растянутая на него полоса захватила бы пустое место.
    const bands = mergeLineBands([band(50, 100, 200, 17), band(50, 160, 200, 17)]);
    expect(bands).toHaveLength(2);
    expect(bands[1].y).toBe(160);
  });

  it('не заполняет промежуток у строк в разных колонках', () => {
    // Строки соседних колонок стоят рядом по вертикали, но текстом не
    // соседствуют: полоса не должна тянуться от одной к другой.
    const bands = mergeLineBands([band(50, 100, 100, 17), band(300, 125.6, 100, 17)]);
    expect(bands).toHaveLength(2);
    expect(bands[1].y).toBe(125.6);
  });
});
