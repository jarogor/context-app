import { describe, expect, it } from 'vitest';
import { buildTextLayer, parseTextZones } from './text-layer';

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

  it('оставляет пустой слой без зон', () => {
    const layer = buildTextLayer('[]', 1, { width: 100, height: 100 });
    expect(layer.querySelectorAll('span')).toHaveLength(0);
  });
});
