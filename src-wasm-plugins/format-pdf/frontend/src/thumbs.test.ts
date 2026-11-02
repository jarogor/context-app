import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Вызовы отрисовки: страница. */
const calls: Array<number> = [];
/** Вызовы освобождения страницы. */
const cleaned: Array<number> = [];
/** Отправленные приложению порции. */
const sent: Array<Array<{ page: number }>> = [];
/** Номера страниц, которые не рисуются. */
let broken: number[] = [];

vi.mock('./engine', () => ({
  engine: () => ({}),
}));

vi.mock('./protocol', () => ({
  post: (message: { value: Array<{ page: number }> }) => {
    sent.push(message.value);
  },
}));

vi.mock('./state', () => ({ state: {} }));

import { resetThumbs, sendThumbs } from './thumbs';
import { state } from './state';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => undefined,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
});

/** Подмена книги в состоянии модуля. */
function book(failing: number[] = []) {
  broken = failing;
  state.doc = {
    getPage: async (number: number) => {
      if (broken.includes(number)) {
        throw new Error('страница не рисуется');
      }
      return {
        getViewport: ({ scale }: { scale: number }) => ({ width: 1200 * scale, height: 1600 * scale }),
        render: () => {
          calls.push(number);
          return { promise: Promise.resolve() };
        },
        cleanup: () => cleaned.push(number),
      };
    },
  } as never;
}

describe('миниатюры PDF', () => {
  it('рисует страницы по одной, отправляет сразу и освобождает разобранную', async () => {
    resetThumbs();
    calls.length = 0;
    cleaned.length = 0;
    sent.length = 0;
    book();

    await sendThumbs([1, 2, 3], 96);

    expect(calls).toEqual([1, 2, 3]);
    // Каждая страница приходит отдельной порцией: панель наполняется сразу.
    expect(sent.map((batch) => batch.map((thumb) => thumb.page))).toEqual([[1], [2], [3]]);
    // Освобождены все отрисованные страницы: память не растёт с числом страниц.
    expect(cleaned).toEqual([1, 2, 3]);
  });

  it('повторный заказ уже нарисованной страницы не рисует её снова', async () => {
    resetThumbs();
    calls.length = 0;
    sent.length = 0;
    book();

    await sendThumbs([1], 96);
    await sendThumbs([1], 96);

    expect(calls).toEqual([1]);
    // Ответ берётся из кэша: панель не ждёт повторной отрисовки.
    expect(sent).toHaveLength(2);
  });

  it('сбойную страницу не заказывает повторно', async () => {
    resetThumbs();
    calls.length = 0;
    sent.length = 0;
    book([2]);

    for (let round = 0; round < 4; round += 1) {
      await sendThumbs([1, 2, 3], 96);
    }

    // Сбойная страница пробуется ровно один раз, успешные рисуются по одному
    // разу и дальше отдаются из кэша.
    expect(calls).toEqual([1, 3]);
    expect(sent.map((batch) => batch.map((thumb) => thumb.page))).toEqual([
      [1],
      [3],
      [1],
      [3],
      [1],
      [3],
      [1],
      [3],
    ]);
  });
});
