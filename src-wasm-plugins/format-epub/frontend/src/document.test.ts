import { describe, expect, it, vi } from 'vitest';

import { forceRepaint, bookStyle, SHAPE_FRAME_CLASS } from './document';

describe('перерисовка книги после смены темы', () => {
  it('сдвигает прокрутку на пиксель и возвращает её на место', () => {
    const scrolling = document.scrollingElement ?? document.documentElement;
    // Запись `scrollTop` — единственный сигнал движку, который заставляет его
    // перерисовать уже показанный текст. Проверяются сами записи: без них
    // книга остаётся пустой до прокрутки.
    let stored = 120;
    const written: number[] = [];
    Object.defineProperty(scrolling, 'scrollTop', {
      configurable: true,
      get: () => stored,
      set: (value: number) => {
        stored = value;
        written.push(value);
      },
    });

    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      });

    forceRepaint(document.documentElement);
    // Перерисовка идёт следующим кадром, а не внутри обработчика сообщения.
    expect(written).toEqual([]);
    expect(frames).toHaveLength(1);
    frames[0](0);

    expect(written).toEqual([121, 120]);
    expect(stored).toBe(120);
    requestFrame.mockRestore();
    delete (scrolling as unknown as { scrollTop?: number }).scrollTop;
  });

  it('ничего не делает без окна документа', () => {
    const detached = document.implementation.createHTMLDocument('книга');
    expect(() => forceRepaint(detached.documentElement)).not.toThrow();
  });
});

describe('рамка области фигуры при переходе к заметке', () => {
  it('рисует пунктирный контрастный контур в нормальном режиме наложения', () => {
    const style = bookStyle();
    const index = style.indexOf(`.${SHAPE_FRAME_CLASS}`);
    expect(index, 'правило рамки фигуры найдено').toBeGreaterThanOrEqual(0);
    const end = style.indexOf('}', index);
    const rule = style.slice(index, end);
    // Фигура лежит на тексте умножением, и её цвет на бумаге слабый: рамка
    // обязана рисоваться в нормальном режиме, иначе она тоже побледнеет.
    expect(rule).toContain('mix-blend-mode:normal');
    expect(rule).toContain('outline:2px dashed');
  });
});
