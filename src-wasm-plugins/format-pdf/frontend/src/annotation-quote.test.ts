import { describe, expect, it } from 'vitest';

import { highlightQuoteOf } from './annotations';

/** Элемент текстового слоя pdf.js в координатах страницы 612×792. */
function item(str: string, x: number, baseline: number, width: number) {
  return {
    str,
    width,
    transform: [10, 0, 0, 10, x, baseline],
  };
}

describe('текст встроенного выделения по геометрии', () => {
  // Страница 612×792: строка с базовой линией 700 (сверху 92 px от верха).
  const items = [
    item('Первое', 50, 700, 60),
    item('слово', 112, 700, 50),
    item('Второе', 50, 680, 60),
  ];
  const height = 792;
  const width = 612;

  it('собирает слова, попавшие в прямоугольники выделения', () => {
    // Полоса первой строки: от 92 до 106 px от верха страницы.
    const rects = [{ x: 0.05, y: 0.1, width: 0.3, height: 0.018 }];
    expect(highlightQuoteOf(items, rects, width, height)).toBe('Первое слово');
  });

  it('не захватывает соседнюю строку', () => {
    const rects = [{ x: 0.05, y: 0.125, width: 0.3, height: 0.018 }];
    expect(highlightQuoteOf(items, rects, width, height)).toBe('Второе');
  });

  it('не возвращает текст без геометрии и без элементов', () => {
    expect(highlightQuoteOf(items, [], width, height)).toBe('');
    expect(highlightQuoteOf([], [{ x: 0, y: 0, width: 1, height: 1 }], width, height)).toBe('');
  });

  it('не падает на элементе без матрицы и с нулевой шириной', () => {
    expect(
      highlightQuoteOf(
        [{ str: 'битый' }, item('', 0, 0, 0)],
        [{ x: 0, y: 0, width: 1, height: 1 }],
        width,
        height,
      ),
    ).toBe('');
  });
});
