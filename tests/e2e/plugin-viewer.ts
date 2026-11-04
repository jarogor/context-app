/** Обработчики мока для модуля рисования плагина формата.
 *
 * Браузерные тесты читают **развёрнутый ресурс** плагина, который реально грузит
 * приложение: иначе устаревшая сборка плагина осталась бы незамеченной. Ресурсы
 * собираются `scripts/build-wasm-plugins.sh`, а сервер тестов
 * (`npm run dev:test`) запускает сборку перед прогоном.
 */

import type { Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Корень репозитория. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** MIME-тип файла модуля рисования по расширению (как в ядре приложения). */
function viewerMime(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'html' || extension === 'htm') {
    return 'text/html';
  }
  if (extension === 'mjs' || extension === 'js') {
    return 'text/javascript';
  }
  if (extension === 'css') {
    return 'text/css';
  }
  return 'application/octet-stream';
}

/** Развёрнутый модуль рисования плагина: точка входа и файлы. */
export function viewerBundle(plugin: string): {
  entry: string;
  files: Array<{ path: string; mime: string; data: string }>;
} {
  const dir = resolve(ROOT, 'src-tauri', 'resources', 'plugins', plugin, 'viewer');
  const entry = readFileSync(resolve(dir, 'index.html'), 'utf8');
  const files = readdirSync(dir)
    .sort()
    .map((name) => ({
      path: name,
      mime: viewerMime(name),
      data: readFileSync(resolve(dir, name)).toString('base64'),
    }));
  return { entry, files };
}

/** Модуль рисования плагина и настройка мока текучей книги.
 *
 * Обработчики мока строятся **внутри страницы**: `addInitScript` не переносит
 * функции из тестового процесса, поэтому в контекст передаются только данные
 * (главы, файлы модуля), а обработчики создаются уже в браузере.
 */
export async function mockFlowingBook(
  page: Page,
  format: string,
  chapters: Array<{ title?: string | null; html: string }>,
  extraData: Record<string, unknown> = {},
): Promise<void> {
  const plugin = `format-${format}`;
  const bundle = viewerBundle(plugin);
  await page.addInitScript(
    (payload: {
      format: string;
      chapters: unknown;
      plugin: string;
      bundle: { entry: string; files: Array<{ path: string; mime: string; data: string }> };
      extra: unknown;
    }) => {
      const target = window as unknown as {
        __TEXTURE_MOCK_OVERRIDES__?: { handlers?: Record<string, unknown> };
      };
      const files = payload.bundle.files;
      // Порядок важен: базовые обработчики книги идут первыми, а настройки
      // сценария (`extra`) кладутся поверх — иначе повторная настройка мока
      // стирала бы перехват команды, сделанный тестом раньше.
      target.__TEXTURE_MOCK_OVERRIDES__ = {
        handlers: {
          ...(target.__TEXTURE_MOCK_OVERRIDES__?.handlers ?? {}),
          active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
          // В приложении стоят плагины обоих текучих форматов: формат книги
          // выбирается по расширению файла, а не по этому списку.
          reader_formats: () => ['epub', 'fb2'],
          // Текучая книга: плагин получает разобранные главы, а не байты.
          reader_plugin_for_format: () => ({ plugin_id: payload.plugin, flowing: true }),
          reader_content: () => ({ title: 'Демо-книга', authors: [], chapters: payload.chapters }),
          reader_cover: () => ({ data: null }),
          reader_viewer: () => payload.bundle.entry,
          reader_viewer_files: () => files.map((file) => ({ path: file.path, mime: file.mime })),
          reader_viewer_file: (input: unknown) => {
            const path = (input as { path?: string } | null)?.path ?? '';
            const found = files.find((file) => file.path === path);
            return { path, data: found?.data ?? '' };
          },
          ...(payload.extra as Record<string, unknown>),
        },
      };
    },
    { format, chapters, plugin, bundle, extra: extraData },
  );
}
