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
