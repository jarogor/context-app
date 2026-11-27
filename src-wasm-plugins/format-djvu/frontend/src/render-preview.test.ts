/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Исходник отрисовки страниц. */
const source = readFileSync(resolve(process.cwd(), 'src/render.ts'), 'utf8');

/** Индекс первого вхождения строки; тест падает с внятным сообщением. */
function at(fragment: string): number {
  const index = source.indexOf(fragment);
  expect(index, `в исходнике есть «${fragment}»`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('показ страницы DjVu', () => {
  it('вставляет предварительный кадр до полной отрисовки', () => {
    /* Дефект: растр страницы в 14 МП в WebKit рисуется около секунды, и всё это
       время на месте страницы был белый прямоугольник. Предварительный кадр
       рисуется маленьким канвасом и вставляется сразу, полный приходит следом. */
    const previewInsert = at('pageEl.insertBefore(preview, overlay);');
    const fullQueue = at('fullQueue.push(');
    const fullRender = at('function renderFullPage(');
    expect(previewInsert).toBeLessThan(fullQueue);
    expect(previewInsert).toBeLessThan(fullRender);
  });

  it('рисует предварительный кадр в маленький канвас', () => {
    // Раньше предварительный растр выводился в полный канвас: масштабирование
    // 14 МП на процессоре стоило 440–590 мс, и страница всё равно белела.
    expect(source).toMatch(/previewSide = Math\.max\(64, Math\.round\(info\.width \/ 4\)\)/);
    expect(source).toContain('drawRaster(page, preview, info, viewport');
  });

  it('держит полный кадр до готовности предварительных у остальных страниц', () => {
    // Иначе следующая страница ждала бы целую секунду и белела.
    expect(source).toMatch(
      /fullTimer = setTimeout\(runFullQueue, renderQueue\.length > 0 \? \d+ : 0\);/,
    );
  });
});
