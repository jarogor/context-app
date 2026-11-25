/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Исходник отрисовки страниц. */
const source = readFileSync(resolve(process.cwd(), 'src/render.ts'), 'utf8');

/** Строка создания контекста копии растра по имени канваса. */
function copyContextOf(name: string): string {
  const assignment = source.indexOf(`${name}.width = canvas.width;`);
  expect(assignment, `копия ${name} в исходнике найдена`).toBeGreaterThanOrEqual(0);
  const line = source.indexOf(`${name}.getContext(`, assignment);
  expect(line, `контекст копии ${name} найден`).toBeGreaterThanOrEqual(0);
  return source.slice(line, source.indexOf(';', line) + 1);
}

describe('копии растра страницы', () => {
  it('создают контекст в режиме частого чтения', () => {
    // Дефект: копии растра — крупные канвасы, и без `willReadFrequently` подложка
    // теряет содержимое в WebKitGTK. Кадр подсветок рисует страницу из копии
    // `base`, поэтому на месте текста книги оставалась пустота.
    for (const name of ['lightCanvas', 'baseCanvas']) {
      expect(copyContextOf(name), name).toContain('willReadFrequently: true');
    }
  });
});
