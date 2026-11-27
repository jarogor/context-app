import { describe, expect, it } from 'vitest';

import { mergeLineBands } from './selection';

/** Полоса в координатах документа книги. */
function band(x: number, y: number, width: number, height: number) {
  return { x, y, width, height };
}

describe('слияние полос выделения', () => {
  it('стыкует строки выделения без промежутка', () => {
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

  it('тянет полосу через отступ между абзацами, как заливка', () => {
    /* Замер в живом окне: выделение от заголовка в абзац красится одной
       полосой 83…241, хотя строки стоят на 82.6…119.6 и 146.8…241.8 —
       промежуток в 27 px закрашен. Пока полоса его не заполняла, её верх был
       ниже нарисованной заливки на этот промежуток, и метка у верхнего края
       читалась съехавшей. */
    const bands = mergeLineBands([band(50, 82.6, 200, 37), band(50, 146.8, 200, 25)]);
    expect(bands).toHaveLength(2);
    expect(bands[1].y).toBeCloseTo(119.6, 5);
    expect(bands[1].y + bands[1].height).toBeCloseTo(171.8, 5);
  });

  it('начинает полосу с ближайшего низа при перекрытии строк', () => {
    // Высокий шрифт: вторая строка налезает на первую. Стык идёт по низу
    // первой полосы, двойной плотности на наложении нет.
    const bands = mergeLineBands([band(50, 100, 200, 20), band(50, 112, 200, 20)]);
    expect(bands).toHaveLength(2);
    expect(bands[1].y).toBe(120);
  });
});
