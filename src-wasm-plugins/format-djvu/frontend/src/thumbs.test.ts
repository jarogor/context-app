import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Вызовы отрисовки: страница, DPI и режим качества. */
const calls: Array<{ page: number }> = [];
/** Отправленные приложению порции. */
const sent: Array<Array<{ page: number }>> = [];

/** Состояние подменённого движка: какие страницы не рисуются. */
let broken: number[] = [];

vi.mock('./engine', () => ({
  // Документ миниатюр открывается из байтов книги: в тесте он подменён тем же
  // состоянием, чтобы проверялась логика заказов, а не движок.
  openDocument: () => state.doc,
  newPixmap: () => ({
    width: () => 2,
    height: () => 2,
    view: () => new Uint8ClampedArray(2 * 2 * 4),
    free: () => undefined,
  }),
  renderRequest: () => ({ free: () => undefined }),
}));

vi.mock('./protocol', () => ({
  post: (message: { value: Array<{ page: number }> }) => {
    sent.push(message.value);
  },
}));

vi.mock('./state', () => ({ state: {} }));

import { renderDpiFor, resetThumbs, sendThumbs } from './thumbs';
import { state } from './state';

// jsdom не умеет рисовать: канвас подменяется минимальной заглушкой, которая
// отдаёт данные как настоящий `toDataURL`.
beforeEach(() => {
  // jsdom не умеет рисовать: канвас и `ImageData` подменяются минимальными
  // заглушками, которые ведут себя как настоящие для этого кода.
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: () => undefined,
    drawImage: () => undefined,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
});

/** Подмена книги в состоянии модуля. */
function book(pages: number[], failing: number[] = []) {
  broken = failing;
  // Байты книги: из них модуль собирает отдельный документ миниатюр.
  state.bytes = new Uint8Array([1]);
  state.doc = {
    page_count: () => pages.length,
    page: (index: number) => {
      const number = index + 1;
      return {
        dpi: () => 300,
        width_at: () => 1200,
        height_at: () => 1600,
        bg44_chunk_count: () => 0,
        render_request: () => {
          calls.push({ page: number });
          if (broken.includes(number)) {
            throw new Error('страница не рисуется');
          }
        },
        free: () => undefined,
      };
    },
  } as never;
  state.module = {} as never;
}

describe('разрешение отрисовки миниатюры', () => {
  it('не опускается ниже границы, где маска DjVu рассыпается', () => {
    // Родное разрешение 300: миниатюра всё равно рисуется в нормальном, а не в
    // микроскопическом разрешении. Мельче 96 dpi двухцветная маска сходится без
    // сглаживания, и текст на превью превращается в «жирную кашу».
    expect(renderDpiFor(300)).toBeGreaterThanOrEqual(96);
    // Родное разрешение низкое (скан): берётся граница, а не родное.
    expect(renderDpiFor(24)).toBe(96);
    // Рендер всегда в 96 dpi: растр страницы 300 dpi тогда ≈3 МБ, а не 30 МБ.
    expect(renderDpiFor(1200)).toBe(96);
    expect(renderDpiFor(300)).toBe(96);
  });
});

describe('миниатюры DjVu', () => {
  it('рисует каждую страницу и отправляет её сразу', async () => {
    resetThumbs();
    calls.length = 0;
    sent.length = 0;
    book([1, 2, 3]);

    await sendThumbs([1, 2, 3], 96);

    expect(calls.map((call) => call.page)).toEqual([1, 2, 3]);
    // Каждая страница приходит отдельной порцией: панель наполняется сразу.
    expect(sent.map((batch) => batch.map((thumb) => thumb.page))).toEqual([[1], [2], [3]]);
  });

  it('повторный заказ уже нарисованной страницы не рисует её снова', async () => {
    resetThumbs();
    calls.length = 0;
    sent.length = 0;
    book([1]);

    await sendThumbs([1], 96);
    await sendThumbs([1], 96);

    expect(calls).toHaveLength(1);
    // Ответ берётся из кэша: панель не ждёт повторной отрисовки.
    expect(sent).toHaveLength(2);
  });

  it('сбойную страницу не заказывает повторно', async () => {
    resetThumbs();
    calls.length = 0;
    sent.length = 0;
    book([1, 2, 3], [2]);

    // Панель заказывает страницы снова и снова, пока у неё нет картинки: без
    // запрета повторов это был бы бесконечный цикл отрисовки.
    for (let round = 0; round < 5; round += 1) {
      await sendThumbs([1, 2, 3], 96);
    }

    // Сбойная страница пробуется ограниченное число раз (случайный сбой не
    // должен навсегда лишать её превью), успешные рисуются один раз.
    const pagesDrawn = calls.map((call) => call.page);
    expect(pagesDrawn.filter((page) => page === 2)).toHaveLength(2);
    expect(pagesDrawn.filter((page) => page === 1)).toHaveLength(1);
    // Успешные страницы отдаются из кэша в каждом раунде, сбойная — нет.
    const pages = sent.flatMap((batch) => batch.map((thumb) => thumb.page));
    expect(pages.filter((page) => page === 1)).toHaveLength(5);
    expect(pages.filter((page) => page === 3)).toHaveLength(5);
    expect(pages).not.toContain(2);
  });
});
