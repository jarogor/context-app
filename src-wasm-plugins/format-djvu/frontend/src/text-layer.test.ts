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

  describe('горизонталь по буквам слова', () => {
    /** Стенд: канвас с буквами одной строки и слой с зонами слов. */
    function lineSetup(
      letters: Array<{ left: number; right: number }>,
      zones: Array<{ text: string; left: number; width: number }>,
      lineTop = 20,
      lineBottom = 34,
    ) {
      const side = 400;
      const host = document.createElement('div');
      host.style.cssText = `position:absolute;left:0;top:0;width:${side}px;height:${side}px`;
      document.body.append(host);
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const pixels = new Uint8ClampedArray(side * side * 4);
      for (let index = 0; index < pixels.length; index += 4) {
        pixels[index] = 255;
        pixels[index + 1] = 255;
        pixels[index + 2] = 255;
        pixels[index + 3] = 255;
      }
      for (const letter of letters) {
        for (let y = lineTop; y <= lineBottom; y += 1) {
          for (let x = letter.left; x <= letter.right; x += 1) {
            const index = (y * side + x) * 4;
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
        value: () => ({ left: 0, top: 0, right: side, bottom: side, width: side, height: side }),
      });
      host.append(canvas);
      const layer = document.createElement('div');
      layer.className = 'textLayer';
      layer.style.cssText = `position:absolute;left:0;top:0;width:${side}px;height:${side}px`;
      Object.defineProperty(layer, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, right: side, bottom: side, width: side, height: side }),
      });
      host.append(layer);
      for (const zone of zones) {
        const span = document.createElement('span');
        span.textContent = zone.text + ' ';
        span.style.cssText = `position:absolute;left:${zone.left}px;top:${lineTop}px;width:${zone.width}px;height:${lineBottom - lineTop + 1}px;font-size:12px;white-space:pre;color:transparent`;
        Object.defineProperty(span, 'getBoundingClientRect', {
          value: () => ({
            left: zone.left,
            top: lineTop,
            right: zone.left + zone.width,
            bottom: lineBottom + 1,
            width: zone.width,
            height: lineBottom - lineTop + 1,
          }),
        });
        // jsdom не считает ширину содержимого: она задаётся явно, чтобы
        // `scaleX` получал определённое значение.
        Object.defineProperty(span, 'scrollWidth', { value: 100 });
        layer.append(span);
      }
      return { host, canvas, layer };
    }

    /** Левый и правый край рамки слова в пикселях растра. */
    function frame(span: HTMLElement): { left: number; right: number } {
      const left = Number.parseFloat(span.style.left);
      const natural = Number.parseFloat(span.style.width);
      const scale = /scaleX\(([^)]+)\)/.exec(span.style.transform);
      const width = scale ? natural * Number.parseFloat(scale[1]) : natural;
      return { left, right: left + width };
    }

    it('не тянет длинное слово до конца строки при соседе справа', () => {
      // Регрессия: условие «зона шире трёх высот строки» отбрасывало почти все
      // слова в ветку «последнее слово», и рамка тянулась до конца строки —
      // слово выглядело растянутым на всю строку.
      const { host, canvas, layer } = lineSetup(
        [
          { left: 20, right: 28 },
          { left: 31, right: 39 },
          { left: 42, right: 50 },
          { left: 53, right: 61 },
          { left: 64, right: 72 },
          { left: 100, right: 108 },
          { left: 111, right: 119 },
          { left: 122, right: 130 },
        ],
        [
          { text: 'длинное', left: 20, width: 53 },
          { text: 'ещё', left: 100, width: 31 },
        ],
      );
      try {
        alignTextLayerToRaster(layer, canvas, false);
        const spans = Array.from(layer.querySelectorAll('span')) as HTMLElement[];
        const boxes = spans.map(frame);
        // Первое слово шириной 53 (больше трёх высот строки 15), но рамка —
        // только по своим буквам, до 73, а не до конца строки 131.
        expect(boxes[0].left).toBeCloseTo(20, 0);
        expect(boxes[0].right).toBeCloseTo(73, 0);
        expect(boxes[1].left).toBeCloseTo(100, 0);
        expect(boxes[1].right).toBeCloseTo(131, 0);
      } finally {
        host.remove();
      }
    });

    it('накрывает всё длинное слово, хотя зона уже букв', () => {
      const { host, canvas, layer } = lineSetup(
        [
          { left: 20, right: 28 },
          { left: 31, right: 39 },
          { left: 42, right: 50 },
          { left: 53, right: 61 },
          { left: 64, right: 72 },
        ],
        [{ text: 'слово', left: 20, width: 40 }],
      );
      try {
        alignTextLayerToRaster(layer, canvas, false);
        const span = layer.querySelector('span') as HTMLElement;
        const box = frame(span);
        expect(box.left).toBeCloseTo(20, 0);
        // Правый край — по последней букве слова (72), а не по краю зоны (60).
        expect(box.right).toBeCloseTo(73, 0);
      } finally {
        host.remove();
      }
    });

    it('берёт одно слово, когда зона растянута на всю строку', () => {
      // Зона строки с текстом одного слова: рамка не должна растягиваться на
      // полстроки, а обязана совпасть с буквами первого слова.
      const { host, canvas, layer } = lineSetup(
        [
          { left: 20, right: 34 },
          { left: 40, right: 54 },
          { left: 60, right: 74 },
          { left: 100, right: 114 },
        ],
        [{ text: 'Вся', left: 20, width: 360 }],
      );
      try {
        alignTextLayerToRaster(layer, canvas, false);
        const span = layer.querySelector('span') as HTMLElement;
        const box = frame(span);
        expect(box.left).toBeCloseTo(20, 0);
        expect(box.right).toBeCloseTo(75, 0);
      } finally {
        host.remove();
      }
    });

    it('не режет слово на буквах, если просвет внутри слова', () => {
      // Дефект: `с→п` в плотном шрифте даёт просвет 13 px при межсловном 16, и
      // рамка обрывалась на первой букве.
      // Внутри слова просвет `с→п` почти как межсловный: 13 px.
      const { host, canvas, layer } = lineSetup(
        [
          { left: 20, right: 40 },
          { left: 54, right: 74 },
          { left: 88, right: 108 },
        ],
        [{ text: 'спасает', left: 20, width: 104 }],
      );
      try {
        alignTextLayerToRaster(layer, canvas, false);
        const span = layer.querySelector('span') as HTMLElement;
        const box = frame(span);
        expect(box.left).toBeCloseTo(20, 0);
        // Все три буквы слова — до 108; четвёртая группа дальше — не его.
        expect(box.right).toBeCloseTo(109, 0);
      } finally {
        host.remove();
      }
    });

    it('ставит каждому слову строки свою группу букв', () => {
      // Смежные слова: у каждого своя рамка, без захвата чужих букв.
      const { host, canvas, layer } = lineSetup(
        [
          { left: 20, right: 36 },
          { left: 40, right: 56 },
          { left: 100, right: 116 },
          { left: 120, right: 136 },
        ],
        [
          { text: 'первое', left: 20, width: 60 },
          { text: 'второе', left: 100, width: 60 },
        ],
      );
      try {
        alignTextLayerToRaster(layer, canvas, false);
        const spans = Array.from(layer.querySelectorAll('span')) as HTMLElement[];
        const boxes = spans.map(frame);
        expect(boxes[0].left).toBeCloseTo(20, 0);
        expect(boxes[0].right).toBeCloseTo(57, 0);
        expect(boxes[1].left).toBeCloseTo(100, 0);
        expect(boxes[1].right).toBeCloseTo(137, 0);
      } finally {
        host.remove();
      }
    });
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
