import { describe, expect, it } from 'vitest';

import { clampByte, createPageColors, noteColor, parseHexColor, recolorImageData } from './theme';

describe('parseHexColor', () => {
  it('разбирает цвет с решёткой и без', () => {
    expect(parseHexColor('#3f3b38')).toEqual({ r: 0x3f, g: 0x3b, b: 0x38 });
    expect(parseHexColor('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('отбрасывает неподходящее значение', () => {
    expect(parseHexColor('#xyz')).toBeNull();
    expect(parseHexColor(42)).toBeNull();
    expect(parseHexColor(null)).toBeNull();
  });
});

describe('createPageColors', () => {
  it('берёт цвета темы', () => {
    const colors = createPageColors({ paper: '#101112', ink: '#f0f1f2' });
    expect(colors.paperCss).toBe('rgb(16, 17, 18)');
    expect(colors.inkCss).toBe('rgb(240, 241, 242)');
  });

  it('без темы даёт нейтральную тёмную бумагу', () => {
    expect(createPageColors(null).paperCss).toBe('rgb(63, 59, 56)');
  });
});

describe('clampByte', () => {
  it('ограничивает диапазоном 0–255', () => {
    expect(clampByte(-10)).toBe(0);
    expect(clampByte(300)).toBe(255);
    expect(clampByte(128)).toBe(128);
  });
});

describe('recolorImageData', () => {
  it('переводит белое в бумагу, чёрное — в текст', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    recolorImageData(data, createPageColors({ paper: '#202020', ink: '#e0e0e0' }));
    expect(Array.from(data.slice(0, 3))).toEqual([0x20, 0x20, 0x20]);
    expect(Array.from(data.slice(4, 7))).toEqual([0xe0, 0xe0, 0xe0]);
  });

  it('сохраняет цветной оттенок пикселя', () => {
    // Насыщенный красный: яркость низкая, значит ближе к «чернилам», но
    // разница каналов от яркости остаётся и даёт красный оттенок.
    const data = new Uint8ClampedArray([255, 0, 0, 255]);
    recolorImageData(data, createPageColors({ paper: '#000000', ink: '#000000' }));
    expect(data[0]).toBeGreaterThan(data[1]);
    expect(data[1]).toBe(data[2]);
  });
});

describe('noteColor', () => {
  it('неизвестный цвет даёт жёлтый', () => {
    expect(noteColor('нет')).toBe(noteColor('yellow'));
    expect(noteColor(undefined)).toBe(noteColor('yellow'));
  });
});
