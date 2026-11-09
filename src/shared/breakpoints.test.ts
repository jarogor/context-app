import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NARROW_MAX_WIDTH, PHONE_MAX_WIDTH } from './breakpoints';

/** Значение токена точки перелома из `tokens.css` в rem. */
function tokenRem(name: string): number {
  const css = readFileSync(resolve(process.cwd(), 'packages/ui/src/tokens.css'), 'utf8');
  const match = new RegExp(`--breakpoint-${name}:\\s*([\\d.]+)rem`).exec(css);
  if (!match) {
    throw new Error(`Нет токена --breakpoint-${name}`);
  }
  return Number.parseFloat(match[1]);
}

/** Нижняя граница медиазапроса `max-width` в rem. */
function queryRem(query: string): number {
  const match = /max-width:\s*([\d.]+)rem/.exec(query);
  if (!match) {
    throw new Error(`Запрос без max-width: ${query}`);
  }
  return Number.parseFloat(match[1]);
}

/**
 * Точки перелома заданы в двух местах: токены для Tailwind и константы для
 * `matchMedia`. Тест ловит расхождение — иначе раскладка и скрипт переключались
 * бы на разных ширинах.
 */
describe('точки перелома', () => {
  it('подступень смартфона совпадает с токеном `phone`', () => {
    // Медиазапрос берёт значение «до» порога: 0.01rem закрывает зазор.
    expect(queryRem(PHONE_MAX_WIDTH)).toBeCloseTo(tokenRem('phone') - 0.01, 2);
  });

  it('узкое окно совпадает с токеном `large-tablet`', () => {
    expect(queryRem(NARROW_MAX_WIDTH)).toBeCloseTo(tokenRem('large-tablet') - 0.01, 2);
  });
});
