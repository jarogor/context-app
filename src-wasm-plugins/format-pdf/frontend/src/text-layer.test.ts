import { afterEach, describe, expect, it, vi } from 'vitest';

import { alignTextLayer, waitForRasterInk } from './text-layer';

/** Канвас с заданным рисунком: `ink` — заполнять ли строку тёмными пикселями.
 *
 * `jsdom` не реализует растровые операции, поэтому контекст подменяется заглушкой
 * с готовым `ImageData`. Проверяется не рисование, а логика ожидания готовности
 * растра и выравнивания по нему.
 */
function canvasWithInk(width: number, height: number, ink: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 255;
  }
  if (ink) {
    // Тёмная полоса в левой половине: есть «чернила» для поиска.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < Math.floor(width / 2); x += 1) {
        const index = (y * width + x) * 4;
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
      }
    }
  }
  const context = {
    getImageData: () => ({ data } as unknown as ImageData),
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(canvas, 'getContext', { value: () => context });
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0 }),
  });
  return canvas;
}

/** Канвас, который «оживает» с заданной попытки: до неё — белый, после — с чернилами. */
function lateCanvas(width: number, height: number, readyAfter: number): HTMLCanvasElement {
  let reads = 0;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const blank = new Uint8ClampedArray(width * height * 4).fill(255);
  const dark = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < dark.length; index += 4) {
    dark[index] = 0;
    dark[index + 1] = 0;
    dark[index + 2] = 0;
    dark[index + 3] = 255;
  }
  const context = {
    getImageData: () => {
      reads += 1;
      return { data: reads > readyAfter ? dark : blank } as unknown as ImageData;
    },
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(canvas, 'getContext', { value: () => context });
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0 }),
  });
  return canvas;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForRasterInk', () => {
  it('сразу возвращает true, если чернила уже нарисованы', async () => {
    const canvas = canvasWithInk(64, 64, true);
    expect(await waitForRasterInk(canvas)).toBe(true);
  });

  it('дожидается появления растра, если канвас сперва пуст', async () => {
    // Первые два чтения — белый канвас (WebKit рисует изображение позже),
    // затем появляются чернила. Ожидание обязано их дождаться.
    const canvas = lateCanvas(64, 64, 2);
    expect(await waitForRasterInk(canvas)).toBe(true);
  });

  it('не задерживает пустой скан дольше предела ожидания', async () => {
    const canvas = canvasWithInk(64, 64, false);
    const started = performance.now();
    expect(await waitForRasterInk(canvas, 60)).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('не падает на канвасе без размеров', async () => {
    const canvas = canvasWithInk(0, 0, false);
    expect(await waitForRasterInk(canvas)).toBe(false);
  });
});

describe('alignTextLayer', () => {
  /** Страница 100×20 пунктов: рамка нужна, чтобы доли считались, а не делились на ноль. */
  function pageBox(): DOMRect {
    return { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0 } as DOMRect;
  }

  /** Спан строки с заданной горизонтальной рамкой. */
  function spanWithBox(text: string, left: number, right: number): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = text;
    Object.defineProperty(span, 'getBoundingClientRect', {
      value: () =>
        ({ top: 0, bottom: 20, left, right, width: right - left, height: 20, x: left, y: 0 }) as DOMRect,
    });
    return span;
  }

  /** Канвас-«скан»: вертикальные штрихи-«буквы» до заданного столбца.
   *
   * Сплошная полоса чернил похожа на горизонтальную линейку, которую выравнивание
   * намеренно пропускает, поэтому штрихи чередуются с пробелами, как буквы.
   */
  function canvasInkTo(width: number, height: number, inkRight: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < inkRight; x += 1) {
        if (x % 8 >= 4) {
          continue;
        }
        const index = (y * width + x) * 4;
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
      }
    }
    const context = { getImageData: () => ({ data } as unknown as ImageData) } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0 }),
    });
    return canvas;
  }

  /** Канвас-«скан» в тёмной теме: светлые штрихи-«буквы» на тёмной бумаге. */
  function darkCanvasInkTo(width: number, height: number, inkRight: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    // Бумага — вне обоих порогов «чернил» (не светлая и не тёмная), чтобы тест
    // проверял именно признак тёмной темы, а не яркость фона.
    const data = new Uint8ClampedArray(width * height * 4).fill(150);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < inkRight; x += 1) {
        if (x % 8 >= 4) {
          continue;
        }
        const index = (y * width + x) * 4;
        data[index] = 231;
        data[index + 1] = 226;
        data[index + 2] = 215;
      }
    }
    for (let index = 3; index < data.length; index += 4) {
      data[index] = 255;
    }
    const context = {
      getImageData: () => ({ data } as unknown as ImageData),
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0 }),
    });
    return canvas;
  }

  it('растягивает строку целиком: и хвост, и середину', () => {
    // Невидимая строка короче растра: растягивается вся строка от левого края,
    // поэтому середина и хвост остаются на своих видимых местах.
    const page = document.createElement('div');
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    const first = spanWithBox('Начало строки', 0, 40);
    const tail = spanWithBox('хвост', 40, 80);
    layer.append(first, tail);
    page.append(layer);
    document.body.append(page);
    Object.defineProperty(window, 'getComputedStyle', {
      value: () => ({ fontSize: '12px', transform: 'none' }) as unknown as CSSStyleDeclaration,
    });

    // Чернила растра шире слоя; штрихи-«буквы» идут до правого края.
    const canvas = canvasInkTo(100, 20, 96);
    const aligned = alignTextLayer(layer, canvas, pageBox());

    expect(aligned).toBeGreaterThanOrEqual(1);
    const scale = (span: HTMLElement) =>
      Number.parseFloat(span.style.transform.replace('matrix(', '').split(',')[0]);
    // Оба слова строки растянуты одинаково; левый край строки на месте.
    expect(scale(first)).toBeGreaterThan(1);
    expect(scale(tail)).toBeCloseTo(scale(first), 5);
    expect(Number.parseFloat(first.style.left)).toBe(0);
    page.remove();
  });

  it('не трогает строку, стоящую вровень с чернилами', () => {
    const page = document.createElement('div');
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    // Правый край строки — на границе штриха: чернила не шире строки.
    const span = spanWithBox('Строка', 0, 92);
    layer.append(span);
    page.append(layer);
    document.body.append(page);
    Object.defineProperty(window, 'getComputedStyle', {
      value: () => ({ fontSize: '12px', transform: 'none' }) as unknown as CSSStyleDeclaration,
    });

    const canvas = canvasInkTo(100, 20, 96);
    alignTextLayer(layer, canvas, pageBox());

    expect(span.style.left).toBe('');
    expect(span.style.transform).toBe('');
    page.remove();
  });

  it('на тёмной странице чернилами считает светлый текст', () => {
    // Тёмная тема перекрашивает растр: светлый текст на тёмной бумаге.
    const page = document.createElement('div');
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    const tail = spanWithBox('хвост', 40, 80);
    layer.append(spanWithBox('Начало строки', 0, 40), tail);
    page.append(layer);
    document.body.append(page);
    Object.defineProperty(window, 'getComputedStyle', {
      value: () => ({ fontSize: '12px', transform: 'none' }) as unknown as CSSStyleDeclaration,
    });

    const canvas = darkCanvasInkTo(100, 20, 96);
    // Без признака тёмной темы «чернил» не найти: слова не трогаются.
    expect(alignTextLayer(layer, canvas, pageBox(), false)).toBe(0);
    expect(tail.style.transform).toBe('');
    // С признаком — светлый текст считается чернилами, слова выравниваются.
    expect(alignTextLayer(layer, canvas, pageBox(), true)).toBeGreaterThanOrEqual(1);
    page.remove();
  });
});
