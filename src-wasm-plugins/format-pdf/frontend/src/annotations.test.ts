import { describe, expect, it } from 'vitest';

import { annotationsFromRaw, pageRectsFromQuadPoints } from './annotations';

describe('геометрия встроенных пометок PDF', () => {
  it('переводит quadPoints в доли страницы с верхним левым углом', () => {
    // Один прямоугольник 100×20 в нижней половине страницы 200×100:
    // PDF считает Y снизу, доли — сверху.
    const rects = pageRectsFromQuadPoints(
      [0, 0, 100, 0, 0, 20, 100, 20],
      200,
      100,
    );
    expect(rects).toEqual([{ x: 0, y: 0.8, width: 0.5, height: 0.2 }]);
  });

  it('разбирает несколько восьмёрок как несколько строк', () => {
    const rects = pageRectsFromQuadPoints(
      [0, 80, 100, 80, 0, 100, 100, 100, 0, 50, 50, 50, 0, 70, 50, 70],
      100,
      100,
    );
    expect(rects).toHaveLength(2);
    expect(rects[0].y).toBeCloseTo(0);
    expect(rects[1].width).toBeCloseTo(0.5);
  });

  it('отдаёт пустой список при нулевом размере страницы', () => {
    expect(pageRectsFromQuadPoints([0, 0, 10, 0, 0, 10, 10, 10], 0, 0)).toEqual([]);
  });
});

describe('разбор аннотаций страницы', () => {
  it('оставляет выделения, стикеры и надписи, отбрасывая прочее', () => {
    const annotations = annotationsFromRaw(
      [
        {
          id: 'h',
          subtype: 'Highlight',
          quadPoints: [10, 10, 50, 10, 10, 20, 50, 20],
          contentsObj: { str: ' мысль ' },
          author: 'Автор',
          color: [255, 255, 0],
        },
        { id: 't', subtype: 'Text', rect: [5, 5, 20, 20], contentsObj: { str: 'стикер' } },
        { id: 'f', subtype: 'FreeText', rect: [30, 30, 80, 50] },
        { id: 'u', subtype: 'Underline', quadPoints: [10, 40, 50, 40, 10, 50, 50, 50] },
        { id: 'link', subtype: 'Link', rect: [0, 0, 10, 10] },
        { id: 'ink', subtype: 'Ink', rect: [0, 0, 10, 10] },
        { id: '', subtype: 'Highlight', quadPoints: [10, 10, 50, 10, 10, 20, 50, 20] },
      ],
      3,
      100,
      100,
    );
    expect(annotations.map((item) => [item.id, item.kind])).toEqual([
      ['h', 'highlight'],
      ['t', 'note'],
      ['f', 'freetext'],
      ['u', 'underline'],
    ]);
    expect(annotations[0].comment).toBe('мысль');
    expect(annotations[0].author).toBe('Автор');
    expect(annotations[0].color).toBe('#ffff00');
    expect(annotations[0].page).toBe(3);
  });

  it('отбрасывает выделение без геометрии, но не текстовую пометку', () => {
    const annotations = annotationsFromRaw(
      [
        { id: 'h', subtype: 'Highlight' },
        { id: 't', subtype: 'Text' },
      ],
      1,
      100,
      100,
    );
    expect(annotations.map((item) => item.id)).toEqual(['t']);
  });
});
