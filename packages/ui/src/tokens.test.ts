import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Содержимое файла токенов дизайн-системы. */
const tokens = readFileSync(resolve(process.cwd(), 'src/tokens.css'), 'utf8');

describe('токены оформления', () => {
  it('объявляет три уровня фона: область, панель и карточка', () => {
    expect(tokens).toContain('--background:');
    expect(tokens).toContain('--panel:');
    expect(tokens).toContain('--card:');
  });

  it('выводит фон панели производным от базовых токенов', () => {
    const panel = tokens.match(/--panel:\s*([^;]+);/);
    expect(panel).toBeTruthy();
    expect(panel?.[1]).toContain('color-mix');
  });

  it('объявляет единый набор теней и выводит его в утилиты', () => {
    expect(tokens).toContain('--elevation-raised:');
    expect(tokens).toContain('--elevation-overlay:');
    expect(tokens).toContain('--shadow-raised:');
    expect(tokens).toContain('--shadow-overlay:');
  });

  it('объявляет роли размера текста с размером, интервалом и насыщенностью', () => {
    for (const role of ['role-display', 'role-title', 'role-subtitle', 'role-body', 'role-label', 'role-caption', 'role-mono']) {
      expect(tokens, role).toContain(`@utility ${role}`);
    }
    // Размер и междустрочный интервал входят в каждую роль.
    expect(tokens).toMatch(/@utility role-body\s*\{[^}]*font-size:[^}]*line-height:/s);
  });

  it('не опускает размер ролей ниже 0.75rem', () => {
    const sizes = [...tokens.matchAll(/@utility role-[a-z]+\s*\{[^}]*font-size:\s*([\d.]+)rem/gs)];
    expect(sizes.length).toBeGreaterThan(0);
    for (const [, size] of sizes) {
      expect(Number(size)).toBeGreaterThanOrEqual(0.75);
    }
  });
});
