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
  it('растягивает последний span строки до правого края чернил', () => {
    // Строка из двух span'ов; правый (хвост) короче чернил растра.
    const page = document.createElement('div');
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    const first = document.createElement('span');
    first.textContent = 'Начало строки';
    const tail = document.createElement('span');
    tail.textContent = 'хвост';
    layer.append(first, tail);
    page.append(layer);
    document.body.append(page);
    Object.defineProperty(tail, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 20, left: 40, right: 80, width: 40, height: 20, x: 40, y: 0 }),
    });
    Object.defineProperty(first, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 20, left: 0, right: 40, width: 40, height: 20, x: 0, y: 0 }),
    });
    Object.defineProperty(window, 'getComputedStyle', {
      value: () => ({ fontSize: '12px', transform: 'none' }) as unknown as CSSStyleDeclaration,
    });

    const canvas = canvasWithInk(100, 20, true);
    const aligned = alignTextLayer(layer, canvas, page.getBoundingClientRect());

    // Строка выровнена по чернилам: правый край полосы доходит до них.
    expect(aligned).toBeGreaterThanOrEqual(1);
    page.remove();
  });
});
