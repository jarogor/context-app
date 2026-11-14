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

  it('смешивает цвет с указанной поверхностью', () => {
    const fill = accentFill('blue', { base: 'var(--card)' });
    expect(fill).toContain('#2563eb');
    expect(fill).toContain('var(--card)');
    expect(fill).toContain('color-mix');
  });

  it('держит заливку приглушённой на всех ступенях', () => {
    // Насыщенная заливка заставила бы текст спорить с фоном: даже самая плотная
    // ступень остаётся ниже половины цвета.
    for (const strength of ['tint', 'soft', 'active'] as const) {
      const fill = accentFill('red', { strength }) ?? '';
      const percent = Number(fill.match(/(\d+)%/)?.[1] ?? '100');
      expect(percent).toBeLessThanOrEqual(30);
    }
  });

  it('делает плотнее ступень active, а не места применения', () => {
    const tint = accentFill('green', { strength: 'tint' }) ?? '';
    const soft = accentFill('green', { strength: 'soft' }) ?? '';
    const active = accentFill('green', { strength: 'active' }) ?? '';
    expect(tint).not.toBe(soft);
    expect(soft).not.toBe(active);
  });

  it('смешивает обводку с общей линией темы, а не с заливкой', () => {
    const line = accentLine('purple');
    expect(line).toContain('#9333ea');
    expect(line).toContain('var(--border)');
  });
});
