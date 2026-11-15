import { describe, expect, it } from 'vitest';

import { ACCENT_COLORS, ACCENT_COLOR_SWATCHES, accentFill, accentLine } from './accent';

describe('цвета оформления', () => {
  it('предлагает один набор цветов на всё приложение', () => {
    expect(ACCENT_COLORS).toEqual(['yellow', 'green', 'blue', 'red', 'purple']);
    for (const color of ACCENT_COLORS) {
      expect(ACCENT_COLOR_SWATCHES[color]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('не даёт заливки и обводки без цвета', () => {
    expect(accentFill(undefined)).toBeUndefined();
    expect(accentLine(undefined)).toBeUndefined();
  });

  it('смешивает цвет с указанным фоном', () => {
    const fill = accentFill('blue', { base: 'var(--card)' });
    expect(fill).toContain('#2563eb');
    expect(fill).toContain('var(--card)');
    expect(fill).toContain('color-mix');
  });

  it('держит заливку ниже половины цвета на всех ступенях', () => {
    // Доля цвета поднята, чтобы элемент читался цветным, но остаётся ниже
    // половины: подпись на заливке сохраняет контраст.
    for (const strength of ['tint', 'soft', 'active'] as const) {
      const fill = accentFill('red', { strength }) ?? '';
      // Долю задаёт токен стороны; запасное значение в вызове — светлая сторона.
      expect(fill).toContain(`var(--accent-fill-${strength}`);
      const fallback = Number(fill.match(/,\s*(\d+)%\)/)?.[1] ?? '100');
      expect(fallback).toBeLessThan(50);
      expect(fallback).toBeGreaterThan(10);
    }
  });

  it('делает плотнее ступень active, а не места применения', () => {
    const tint = accentFill('green', { strength: 'tint' }) ?? '';
    const soft = accentFill('green', { strength: 'soft' }) ?? '';
    const active = accentFill('green', { strength: 'active' }) ?? '';
    expect(tint).not.toBe(soft);
    expect(soft).not.toBe(active);
  });

  it('смешивает оттенок объекта с нейтральным фоном темы', () => {
    // База смешивания — нейтральный фон, а не заливка объекта: оттенок
    // остаётся виден, но не превращается в яркое пятно.
    const line = accentLine('purple');
    expect(line).toContain('#9333ea');
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
