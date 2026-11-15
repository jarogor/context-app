import { describe, expect, it } from 'vitest';

import {
  ACCENT_COLORS,
  ACCENT_COLOR_SWATCHES,
  ACCENT_FILL_COLORS,
  ACCENT_INK_COLORS,
  accentFill,
  accentLine,
  accentText,
} from './accent';

describe('цвета оформления', () => {
  it('предлагает один набор цветов на всё приложение', () => {
    expect(ACCENT_COLORS).toEqual(['yellow', 'green', 'blue', 'red', 'purple']);
    for (const color of ACCENT_COLORS) {
      expect(ACCENT_COLOR_SWATCHES[color]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('не даёт заливки, подписи и обводки без цвета', () => {
    expect(accentFill(undefined)).toBeUndefined();
    expect(accentText(undefined)).toBeUndefined();
    expect(accentLine(undefined)).toBeUndefined();
  });

  it('берёт готовую заливку стороны, а не смешивает цвет с подложкой', () => {
    // Смешение подмешивало тон темы и искажало сам цвет: красный уходил в
    // розовый, зелёный в бирюзовый, жёлтый в серый. Поэтому значение готовое.
    const fill = accentFill('blue');
    expect(fill).toContain('var(--accent-fill-blue-tint');
    expect(fill).not.toContain('color-mix');
    expect(fill).toContain(ACCENT_FILL_COLORS.light.blue.tint);
  });

  it('держит заливку и подпись заданными для каждой ступени и цвета', () => {
    for (const color of ACCENT_COLORS) {
      for (const strength of ['tint', 'soft', 'active'] as const) {
        expect(ACCENT_FILL_COLORS.light[color][strength]).toMatch(/^#[0-9a-f]{6}$/);
        expect(ACCENT_FILL_COLORS.dark[color][strength]).toMatch(/^#[0-9a-f]{6}$/);
        expect(ACCENT_INK_COLORS.light[color][strength]).toMatch(/^#[0-9a-f]{6}$/);
        expect(ACCENT_INK_COLORS.dark[color][strength]).toMatch(/^#[0-9a-f]{6}$/);
        expect(accentText(color, { strength })).toContain(ACCENT_INK_COLORS.light[color][strength]);
      }
    }
  });

  it('делает плотную ступень плотнее тихой в обеих сторонах темы', () => {
    // Выбранное сильнее невыбранного: плотная ступень темнее в светлой стороне
    // и светлее в тёмной, то есть сильнее отходит от подложки.
    const luminance = (hex: string): number => {
      const value = Number.parseInt(hex.slice(1), 16);
      return ((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114;
    };
    for (const color of ACCENT_COLORS) {
      for (const side of ['light', 'dark'] as const) {
        const tint = luminance(ACCENT_FILL_COLORS[side][color].tint);
        const active = luminance(ACCENT_FILL_COLORS[side][color].active);
        if (side === 'light') {
          expect(active, `${color}: светлая сторона`).toBeLessThan(tint);
        } else {
          expect(active, `${color}: тёмная сторона`).toBeGreaterThan(tint);
        }
      }
    }
  });

  it('смешивает оттенок объекта с нейтральным фоном темы', () => {
    // Обводка — единственное место, где цвет смешивается: она должна быть
    // заметной, но не превращаться в яркую рамку.
    const line = accentLine('purple');
    expect(line).toContain(ACCENT_COLOR_SWATCHES.purple);
    expect(line).toContain('var(--muted)');
  });

  it('делает слабую обводку заметно тише обычной', () => {
    // Невыбранный цветной элемент уже отличается заливкой: яркий контур делал бы
    // его заметнее выбранного, поэтому слабая ступень заметно ниже обычной.
    const strong = accentLine('blue') ?? '';
    const weak = accentLine('blue', { strong: false }) ?? '';
    const strongPercent = Number(strong.match(/(\d+)%/)?.[1]);
    const weakPercent = Number(weak.match(/(\d+)%/)?.[1]);
    expect(weakPercent).toBeLessThan(strongPercent);
    expect(strongPercent).toBeLessThanOrEqual(30);
  });
});
