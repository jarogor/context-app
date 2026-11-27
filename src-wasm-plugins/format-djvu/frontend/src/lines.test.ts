import { describe, expect, it } from 'vitest';

import { tileByLine, tileLineRects } from './lines';

describe('tileByLine', () => {
  it('сливает куски одной строки в один прямоугольник', () => {
    const { merged } = tileByLine([
      { x: 0, y: 0, width: 0.2, height: 0.02 },
      { x: 0.2, y: 0, width: 0.3, height: 0.02 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].x).toBeCloseTo(0);
    expect(merged[0].width).toBeCloseTo(0.5);
  });

  it('стыкует соседние строки абзаца без наложений', () => {
    const { merged } = tileByLine([
      { x: 0, y: 0, width: 0.5, height: 0.02 },
      { x: 0, y: 0.02, width: 0.5, height: 0.02 },
    ]);
    expect(merged).toHaveLength(2);
    // Граница проходит посередине между серединами строк: первая строка
    // опускается до половины шага, вторая начинается там же — наложения нет.
    expect(merged[0].y + merged[0].height).toBeCloseTo(merged[1].y);
  });

  it('сохраняет промежуток между далёкими строками', () => {
    const { merged } = tileByLine([
      { x: 0, y: 0, width: 0.5, height: 0.02 },
      { x: 0, y: 0.1, width: 0.5, height: 0.02 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].y + merged[0].height).toBeLessThan(merged[1].y);
  });

  it('возвращает исходные куски в raw с приведённой вертикалью', () => {
    const { raw } = tileByLine([
      { x: 0, y: 0, width: 0.2, height: 0.02 },
      { x: 0.2, y: 0, width: 0.3, height: 0.02 },
    ]);
    expect(raw).toHaveLength(2);
    expect(raw[0].y).toBeCloseTo(raw[1].y);
  });

  it('отбрасывает пустые прямоугольники и пустой вход', () => {
    expect(tileByLine([]).merged).toEqual([]);
    expect(tileByLine(null).merged).toEqual([]);
    expect(tileByLine([{ x: 0, y: 0, width: 0, height: 0.02 }]).merged).toEqual([]);
  });
});

describe('tileLineRects', () => {
  it('возвращает полосы строк', () => {
    expect(tileLineRects([{ x: 0, y: 0, width: 0.5, height: 0.02 }])).toHaveLength(1);
  });
});

describe('шаг строк страницы', () => {
  it('одна строка выделяется полосой на высоту шага, а не букв', () => {
    // Дефект: шаг брался по самому выделению. У одной строки он равен нулю, и
    // полоса выходила высотой с бокс букв — у строки без выносных элементов
    // всего 7 px вместо 47.
    const { merged } = tileByLine([{ x: 0, y: 0.2, width: 0.5, height: 0.01 }], 0.05);
    expect(merged).toHaveLength(1);
    expect(merged[0].height).toBeCloseTo(0.05, 5);
    // Полоса центрирована по строке: верх и низ отстоят на полшага от её
    // середины (бокс 0.2..0.21, середина 0.205).
    expect(merged[0].y).toBeCloseTo(0.18, 5);
  });

  it('высота строки не меняется от протяжки вниз', () => {
    // Дефект: при протяжке вниз шаг, посчитанный по выделению, рос, и верхняя
    // полоса перескакивала на полстроки (23 px → 35 px).
    const rows = [
      { x: 0, y: 0.2, width: 0.5, height: 0.01 },
      { x: 0, y: 0.25, width: 0.5, height: 0.01 },
      { x: 0, y: 0.3, width: 0.5, height: 0.01 },
    ];
    const one = tileByLine(rows.slice(0, 1), 0.05).merged[0];
    const three = tileByLine(rows, 0.05).merged;
    // Верхняя полоса стоит на месте: тот же верх и та же высота.
    expect(three[0].y).toBeCloseTo(one.y, 5);
    expect(three[0].height).toBeCloseTo(one.height, 5);
    expect(three).toHaveLength(3);
  });

  it('без шага страницы полоса остаётся по боксу', () => {
    const { merged } = tileByLine([{ x: 0, y: 0.2, width: 0.5, height: 0.01 }]);
    expect(merged[0].height).toBeCloseTo(0.01, 5);
  });
});
