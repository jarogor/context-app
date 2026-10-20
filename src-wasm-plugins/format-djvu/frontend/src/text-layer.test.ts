import { describe, expect, it } from 'vitest';
import { alignTextLayerToRaster, buildTextLayer, parseTextZones } from './text-layer';

describe('parseTextZones', () => {
  it('разбирает зоны текста', () => {
    const zones = parseTextZones(
      JSON.stringify([
        { t: 'Слово', x: 10, y: 20, w: 100, h: 30 },
        { t: 'Ещё', x: 120, y: 20, w: 60, h: 30 },
      ]),
    );
    expect(zones).toHaveLength(2);
    expect(zones[0]).toMatchObject({ t: 'Слово', x: 10, y: 20, w: 100, h: 30 });
  });

  it('отбрасывает пустые и некорректные зоны', () => {
    expect(
      parseTextZones(
        JSON.stringify([
          { t: '  ', x: 0, y: 0, w: 10, h: 10 },
          { t: 'Слово', x: 'нет', y: 0, w: 10, h: 10 },
          { t: 'Слово', x: 0, y: 0, w: 0, h: 10 },
        ]),
      ),
    ).toEqual([]);
  });

  it('устойчив к испорченному JSON', () => {
    expect(parseTextZones('не json')).toEqual([]);
  });
});

describe('buildTextLayer', () => {
  it('переводит координаты зон в CSS-пиксели', () => {
    const layer = buildTextLayer(
      JSON.stringify([{ t: 'Слово', x: 20, y: 40, w: 200, h: 60 }]),
      2,
      { width: 100, height: 100 },
    );
    const span = layer.querySelector('span') as HTMLSpanElement;
    expect(span.textContent).toBe('Слово ');
    expect(span.style.left).toBe('10px');
    expect(span.style.top).toBe('20px');
    expect(span.style.width).toBe('100px');
    expect(span.style.height).toBe('30px');
  });

  it('подбирает кегль так, чтобы инлайновый бокс совпал с высотой зоны', () => {
    // Бокс строки выше кегля; рамка выделения берётся именно по боксу, поэтому
    // кегль должен быть меньше высоты зоны, а не почти равен ей.
    const layer = buildTextLayer(
      JSON.stringify([{ t: 'Слово', x: 0, y: 0, w: 100, h: 30 }]),
      1,
      { width: 100, height: 100 },
    );
    const span = layer.querySelector('span') as HTMLSpanElement;
    expect(parseFloat(span.style.fontSize)).toBeLessThan(30);
    expect(parseFloat(span.style.lineHeight)).toBe(30);
  });

  it('оставляет пустой слой без зон', () => {
    const layer = buildTextLayer('[]', 1, { width: 100, height: 100 });
    expect(layer.querySelectorAll('span')).toHaveLength(0);
  });
});

describe('alignTextLayerToRaster', () => {
  /** Канвас с заданными «чернилами»: jsdom не рисует, данные подставляются. */
  function setup(canvasInk: { x: number; y: number; w: number; h: number }) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:200px';
    document.body.append(host);
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:200px';
    host.append(canvas);
    // Пиксели: белый фон и тёмный прямоугольник «чернил».
    const pixels = new Uint8ClampedArray(200 * 200 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    }
    for (let y = canvasInk.y; y < canvasInk.y + canvasInk.h; y += 1) {
      for (let x = canvasInk.x; x < canvasInk.x + canvasInk.w; x += 1) {
        const index = (y * 200 + x) * 4;
        pixels[index] = 0;
        pixels[index + 1] = 0;
        pixels[index + 2] = 0;
      }
    }
    const context = {
      getImageData: () => ({ data: pixels }),
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    // jsdom не считает геометрию: прямоугольники задаются явно.
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 }),
    });
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    layer.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:200px';
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 }),
    });
    const span = document.createElement('span');
    span.textContent = 'Слово ';
    // Зона слова намеренно смещена относительно чернил: движок отдаёт её неточно.
    span.style.cssText = 'position:absolute;left:20px;top:10px;width:60px;height:20px;font-size:12px;line-height:20px;white-space:pre;color:transparent';
    Object.defineProperty(span, 'getBoundingClientRect', {
      value: () => ({ left: 20, top: 10, right: 80, bottom: 30, width: 60, height: 20 }),
    });
    layer.append(span);
    host.append(layer);
    return { host, canvas, span, layer };
  }

  it('сдвигает зону к буквам, а горизонталь ставит по чернилам', () => {
    // Зона движка (10…30) смещена от букв: на сканах она уезжает при пересчёте
    // dpi. Слово сдвигается к буквам (16…30) единым сдвигом страницы, а
    // горизонталь берётся по чернилам слова (24…76).
    const { host, canvas, span, layer } = setup({ x: 24, y: 16, w: 52, h: 14 });
    try {
      const aligned = alignTextLayerToRaster(layer, canvas, false);
      expect(aligned).toBe(1);
      // Буквы в 16…30, зона в 10…30: слово садится на буквы.
      expect(parseFloat(span.style.top)).toBeGreaterThan(10);
      expect(parseFloat(span.style.left)).toBeCloseTo(24, 0);
    } finally {
      host.remove();
    }
  });

  it('не уводит слово к чернилам далеко от его зоны', () => {
    // Единственная строка чернил далеко внизу: сдвиг ограничен половиной шага,
    // поэтому слово остаётся рядом со своей зоной, а не уезжает к чужим буквам.
    const { host, canvas, span, layer } = setup({ x: 24, y: 170, w: 52, h: 14 });
    try {
      alignTextLayerToRaster(layer, canvas, false);
      expect(parseFloat(span.style.top)).toBeGreaterThanOrEqual(10);
      expect(parseFloat(span.style.top)).toBeLessThan(30);
    } finally {
      host.remove();
    }
  });

  it('сажает рамки слов на буквы, когда зоны смещены вверх', () => {
    // Воспроизведение дефекта: несколько строк текста, зоны движка смещены от
    // букв вверх (на сканах это происходит при пересчёте dpi), и слова одной
    // строки имеют зоны разной высоты. Рамка каждого слова обязана накрыть
    // буквы своей строки, а не соседней.
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:300px;height:300px';
    document.body.append(host);
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const pixels = new Uint8ClampedArray(300 * 300 * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 255;
      pixels[index + 1] = 255;
      pixels[index + 2] = 255;
      pixels[index + 3] = 255;
    }
    // Три строки букв: 20…34, 60…74, 100…114.
    const inkLines = [
      { top: 20, bottom: 34 },
      { top: 60, bottom: 74 },
      { top: 100, bottom: 114 },
    ];
    for (const line of inkLines) {
      for (let y = line.top; y <= line.bottom; y += 1) {
        for (let x = 20; x < 280; x += 1) {
          const index = (y * 300 + x) * 4;
          pixels[index] = 0;
          pixels[index + 1] = 0;
          pixels[index + 2] = 0;
        }
      }
    }
    const context = {
      getImageData: () => ({ data: pixels }),
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300 }),
    });
    host.append(canvas);
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    layer.style.cssText = 'position:absolute;left:0;top:0;width:300px;height:300px';
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300 }),
    });
    host.append(layer);
    // Зоны слов: смещены от букв вверх на 6 px, высота разная (20 и 30).
    const zones = [
      { left: 20, top: 14, height: 20 },
      { left: 120, top: 14, height: 30 },
      { left: 20, top: 54, height: 20 },
      { left: 120, top: 54, height: 30 },
      { left: 20, top: 94, height: 20 },
      { left: 120, top: 94, height: 30 },
    ];
    for (const zone of zones) {
      const span = document.createElement('span');
      span.textContent = 'Слово ';
      span.style.cssText = `position:absolute;left:${zone.left}px;top:${zone.top}px;width:80px;height:${zone.height}px;font-size:12px;white-space:pre;color:transparent`;
      Object.defineProperty(span, 'getBoundingClientRect', {
        value: () => ({
          left: zone.left,
          top: zone.top,
          right: zone.left + 80,
          bottom: zone.top + zone.height,
          width: 80,
          height: zone.height,
        }),
      });
      layer.append(span);
    }
    try {
      alignTextLayerToRaster(layer, canvas, false);
      // Каждая рамка накрывает свою строку букв.
      for (const span of Array.from(layer.querySelectorAll('span'))) {
        const top = Number.parseFloat(span.style.top);
        const height = Number.parseFloat(span.style.height);
        const bottom = top + height;
        // Рамка должна совпасть со строкой букв, а не просто накрыть её часть:
        // зона смещена на 6 px при высоте строки 15, и без выравнивания рамка
        // выходит за буквы сверху и не достаёт снизу.
        const covered = inkLines.some(
          (line) =>
            Math.abs(top - line.top) <= 1 &&
            Math.abs(bottom - (line.bottom + 1)) <= 1,
        );
        expect(covered, `рамка ${top}…${bottom}`).toBe(true);
      }
    } finally {
      host.remove();
    }
  });

  it('возвращает ноль без доступа к пикселям', () => {
    const layer = document.createElement('div');
    const fake = {
      width: 10,
      height: 10,
      getContext: () => ({ getImageData: () => { throw new Error('песочница'); } }),
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }),
    } as unknown as HTMLCanvasElement;
    expect(alignTextLayerToRaster(layer, fake, false)).toBe(0);
  });
});
