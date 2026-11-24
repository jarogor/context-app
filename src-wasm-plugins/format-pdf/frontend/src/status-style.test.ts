/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Оформление модуля рисования. */
const style = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

/** Тело правила `#status`. */
function statusRule(): string {
  const index = style.indexOf('#status {');
  expect(index, 'правило #status найдено').toBeGreaterThanOrEqual(0);
  const start = style.indexOf('{', index);
  const end = style.indexOf('}', start);
  return style.slice(start + 1, end);
}

describe('надпись о состоянии чтения', () => {
  it('берёт цвет из темы области чтения', () => {
    // Дефект: цвет был зашит светлым (#e5e7eb) и не менялся со стороной темы —
    // на светлой бумаге надпись пропадала. Цвет обязан приходить из темы
    // области чтения, как и остальные цвета плагина.
    const rule = statusRule();
    expect(rule).toMatch(/color:\s*var\(--(rt-muted|reader-muted-foreground)/);
    expect(rule).not.toMatch(/color:\s*#[0-9a-f]{3,8}/i);
  });
});

describe('рамка области фигуры при переходе к заметке', () => {
  it('рисует пунктирный контрастный контур в нормальном режиме наложения', () => {
    // Фигура лежит на странице умножением, и её цвет на белой бумаге слабый.
    // Рамка обязана рисоваться в нормальном режиме и быть пунктирной, иначе
    // жёлтая линия остаётся незаметной даже во время вспышки.
    expect(style).toContain(".overlay .note-shape[data-flash-frame='true']");
    const index = style.indexOf("[data-flash-frame='true']");
    const rule = style.slice(index, style.indexOf('}', index));
    expect(rule).toContain('mix-blend-mode: normal');
    expect(rule).toContain('outline: 2px dashed');
  });
});
