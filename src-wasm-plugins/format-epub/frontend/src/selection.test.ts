import { describe, expect, it } from 'vitest';

import { mergeLineBands } from '@context/selection';

/** Полоса в координатах документа книги. */
function band(x: number, y: number, width: number, height: number, block = 0) {
  return { x, y, width, height, block };
}

describe('слияние полос выделения', () => {
  it('доводит полосу строки до верха следующей строки абзаца', () => {
    /* `::selection` в WebKit закрашивает межстрочный промежуток: строка
       выделения выше рамки букв. Замер в живом окне на реальной книге:
       первая строка полосы занимала 333.6…350.6, а заливка той же строки —
       333.6…358.6, до верха следующей строки. */
    const bands = mergeLineBands([
      band(50, 100, 200, 17, 0),
      band(50, 125.6, 200, 17, 0),
    ]);
    expect(bands).toHaveLength(2);
    expect(bands[0].y).toBe(100);
    expect(bands[0].y + bands[0].height).toBeCloseTo(125.6, 5);
    expect(bands[1].y).toBe(125.6);
    expect(bands[1].y + bands[1].height).toBeCloseTo(142.6, 5);
  });

  it('не тянет полосу через отступ между абзацами', () => {
    /* Между абзацами отступ остаётся чистым: полоса, протянутая через него,
       поднимала обводку выше нарисованного выделения. */
    const bands = mergeLineBands([
      band(50, 100, 200, 17, 0),
      band(50, 148, 200, 17, 1),
    ]);
    expect(bands).toHaveLength(2);
    expect(bands[0].y + bands[0].height).toBeCloseTo(117, 5);
    expect(bands[1].y).toBe(148);
  });

  it('начинает полосу с ближайшего низа при перекрытии строк', () => {
    // Высокий шрифт: вторая строка налезает на первую. Стык идёт по низу
    // первой полосы, двойной плотности на наложении нет.
    const bands = mergeLineBands([band(50, 100, 200, 20, 0), band(50, 112, 200, 20, 0)]);
    expect(bands).toHaveLength(2);
    expect(bands[1].y).toBe(120);
  });
});
