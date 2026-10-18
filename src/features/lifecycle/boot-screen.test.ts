/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Содержимое статичного экрана загрузки из `index.html`. */
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** Содержимое токенов дизайн-системы: источник истины по шрифту и кеглю. */
const tokens = readFileSync(resolve(process.cwd(), 'packages/ui/src/tokens.css'), 'utf8');

/** Значение токена из `tokens.css` (первое объявление). */
function tokenValue(name: string): string {
  const match = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(`токен --${name} не найден`);
  }
  return match[1].replace(/\s+/g, ' ').trim();
}

/** Тело правила CSS по селектору (до закрывающей скобки). */
function ruleBody(css: string, selector: string): string {
  const index = css.indexOf(selector);
  if (index < 0) {
    throw new Error(`правило ${selector} не найдено`);
  }
  const start = css.indexOf('{', index);
  const end = css.indexOf('}', start);
  return css.slice(start + 1, end);
}

describe('экран загрузки', () => {
  it('использует тот же стек шрифта, что и приложение', () => {
    // Статичный экран (index.html) и приложение (body через --font-sans) должны
    // рисоваться одним шрифтом: иначе в момент загрузки бандла текст «прыгает».
    // В WebKitGTK на Linux `system-ui` и generic `sans-serif` — разные шрифты.
    const screen = ruleBody(indexHtml, 'html,\n      body {').replace(/\s+/g, ' ').trim();
    const expected = tokenValue('font-sans');
    expect(screen).toContain(`font-family: ${expected}`);
  });

  it('использует тот же базовый кегль, что и приложение', () => {
    const htmlRule = ruleBody(
      readFileSync(resolve(process.cwd(), 'src/app/app.css'), 'utf8'),
      '\nhtml {',
    );
    expect(htmlRule).toContain('font-size: 16px');
    const boot = ruleBody(indexHtml, 'body {\n        margin: 0;');
    expect(boot).toContain('font-size: 16px');
  });

  it('повторяет цвета палитр без расхождений', () => {
    // Статичный экран дублирует фон и приглушённый текст каждой палитры (до
    // бандла токены недоступны), поэтому копии обязаны совпадать с `tokens.css`.
    const tokenBlocks = new Map<string, { background?: string; muted?: string }>();
    for (const match of tokens.matchAll(/^(:root[^\n{]*?)\s*\{([^}]*)\}/gm)) {
      const selector = match[1].replace(/\s+/g, ' ').trim();
      if (selector.includes('reader')) {
        continue;
      }
      const body = match[2];
      tokenBlocks.set(selector, {
        background: body.match(/--background:\s*(#[0-9a-fA-F]{6})/)?.[1],
        muted: body.match(/--muted-foreground:\s*(#[0-9a-fA-F]{6})/)?.[1],
      });
    }
    for (const match of indexHtml.matchAll(/^(\s*:root[^\n{]*?)\s*\{([^}]*)\}/gm)) {
      const selector = match[1].replace(/\s+/g, ' ').trim();
      const body = match[2];
      const bootBackground = body.match(/--boot-background:\s*(#[0-9a-fA-F]{6})/)?.[1];
      const bootMuted = body.match(/--boot-muted-foreground:\s*(#[0-9a-fA-F]{6})/)?.[1];
      if (!bootBackground) {
        continue;
      }
      const token = tokenBlocks.get(selector);
      expect(token, `нет палитры ${selector} в tokens.css`).toBeTruthy();
      expect(token?.background, `${selector}: фон`).toBe(bootBackground);
      expect(token?.muted, `${selector}: приглушённый текст`).toBe(bootMuted);
    }
  });
});
