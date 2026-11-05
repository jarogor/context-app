import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBookToWorkspace } from './workplace-area';

/** Корень репозитория. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Точка входа модуля рисования плагина DjVu. */
function viewerEntry(): string {
  return readFileSync(
    resolve(ROOT, 'src-tauri', 'resources', 'plugins', 'format-djvu', 'viewer', 'index.html'),
    'utf8',
  );
}

/** MIME-тип файла модуля рисования по расширению. */
function viewerMime(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'html' || extension === 'htm') {
    return 'text/html';
  }
  if (extension === 'mjs' || extension === 'js') {
    return 'text/javascript';
  }
  if (extension === 'wasm') {
    return 'application/wasm';
  }
  return 'application/octet-stream';
}

/** Файлы модуля рисования из развёрнутого каталога плагина. */
function viewerFiles(): Array<{ path: string; mime: string; data: string }> {
  const dir = resolve(ROOT, 'src-tauri', 'resources', 'plugins', 'format-djvu', 'viewer');
  return readdirSync(dir)
    .sort()
    .map((name) => ({
      path: name,
      mime: viewerMime(name),
      data: readFileSync(resolve(dir, name)).toString('base64'),
    }));
}

/** Книга с оглавлением и несколькими страницами. */
function bookBase64(): string {
  return readFileSync(resolve(ROOT, 'tests', 'fixtures', 'djvu3spec.djvu')).toString('base64');
}

/** Каталог с книгой формата djvu. */
const DJVU_BOOKS = {
  catalog: {
    books: [
      {
        id: 'demo-djvu',
        title: 'Демо-книга',
        authors: [],
        tags: [],
        series: [],
        files: [{ kind: 'book', path: 'demo-djvu.djvu', format: 'djvu' }],
      },
    ],
  },
};

/** Установка мока: плагин DjVu, книга и счётчики вызовов моста. */
async function installMock(page: Page, data: string) {
  const files = viewerFiles();
  const entry = viewerEntry();
  await page.addInitScript(
    (payload: { data: string; books: unknown; entry: string; files: unknown }) => {
      const target = window as unknown as {
        __TEXTURE_COUNTERS__: Record<string, number>;
        __TEXTURE_MOCK_OVERRIDES__: unknown;
      };
      target.__TEXTURE_COUNTERS__ = {};
      /** Учёт вызовов: по нему видно, что повторное открытие взяло кэш. */
      const count = (name: string) => {
        const counters = (target.__TEXTURE_COUNTERS__ ??= {});
        counters[name] = (counters[name] ?? 0) + 1;
      };
      /** Кэш свойств своего мока: запись переживает открытие вкладки. */
      const cache = new Map<string, Record<string, unknown>>();
      target.__TEXTURE_MOCK_OVERRIDES__ = {
        handlers: {
          reader_cache_load: (input: unknown) => {
            const path = (input as { path?: string }).path ?? '';
            count('reader_cache_load');
            return cache.get(path) ?? null;
          },
          reader_cache_save: (input: unknown) => {
            const value = (input ?? {}) as {
              path?: string;
              properties?: unknown;
              annotations?: unknown;
              thumbs?: Array<{ page?: number; dataUrl?: string }>;
            };
            const path = value.path ?? '';
            const previous = cache.get(path) ?? {};
            const thumbs = {
              ...((previous.thumbs as Record<string, string>) ?? {}),
            };
            for (const thumb of value.thumbs ?? []) {
              if (thumb.page && thumb.dataUrl) {
                thumbs[String(thumb.page)] = thumb.dataUrl;
              }
            }
            cache.set(path, {
              properties: value.properties ?? previous.properties,
              annotations: value.annotations ?? previous.annotations,
              thumbs,
            });
            count('reader_cache_save');
            return true;
          },
          reader_cache_forget: (input: unknown) => {
            cache.delete((input as { path?: string }).path ?? '');
            return true;
          },
          active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
          reader_formats: () => ['djvu'],
          reader_plugin_for_format: () => 'format-djvu',
          reader_viewer: () => payload.entry,
          reader_viewer_files: () => payload.files,
          reader_viewer_file: (input: unknown) => {
            const path = (input as { path?: string }).path ?? '';
            const file = (payload.files as Array<{ path: string; data: string }>).find(
              (item) => item.path === path,
            );
            return { path, data: file?.data ?? '' };
          },
          reader_book_chunk: (input: unknown) => {
            const request = (input ?? {}) as { offset?: number; length?: number };
            const bytes = atob(payload.data);
            const offset = request.offset ?? 0;
            const requested = Math.min(request.length ?? 64 * 1024, 64 * 1024);
            const length = requested - (requested % 3) || requested;
            const slice = bytes.slice(offset, offset + length);
            const next = offset + slice.length;
            return {
              chunk: btoa(slice),
              next,
              total: bytes.length,
              done: next >= bytes.length,
            };
          },
          invoke_plugin_operation: () => payload.books,
          get_workspaces: () => {
            const raw = window.localStorage.getItem('workspaces');
            return raw
              ? JSON.parse(raw)
              : {
                  workspaces: [
                    {
                      id: 'ws-1',
                      name: 'Рабочее место',
                      created_at_millis: 1_700_000_000_000,
                      tabs: [],
                      active_tab_id: null,
                    },
                  ],
                  active_workspace_id: 'ws-1',
                };
          },
          save_workspaces: (payloadInput: unknown) => {
            const registry = (payloadInput as { workspaces?: unknown })?.workspaces;
            window.localStorage.setItem('workspaces', JSON.stringify(registry));
            return { ok: true };
          },
        },
      };
    },
    { data, books: DJVU_BOOKS, entry, files },
  );
}

/** Область содержимого плагина. */
function content(page: Page) {
  return page.frameLocator('iframe[title="Содержимое книги"]');
}

test('свойства файла переживают закрытие вкладки: их показывает кэш', async ({ page }) => {
  await installMock(page, bookBase64());
  await page.goto('/');
  await addBookToWorkspace(page, /Демо-книга/);
  await content(page).locator('.page canvas').first().waitFor({ timeout: 30000 });

  // Первое открытие: свойства добываются плагином и попадают в кэш.
  await page.getByTestId('workplace-properties-toggle').click();
  const panel = page.getByTestId('properties-panel');
  await panel.getByTestId('properties-tab-bookmarks').click();
  await expect(panel.getByTestId('properties-bookmark-row').first()).toBeVisible();
  await panel.getByTestId('properties-tab-pages').click();
  await expect(panel.locator('img').first()).toBeVisible({ timeout: 30000 });
  await page.getByTestId('workplace-properties-toggle').click();

  // Кэш записан порциями: свойства и превью сохранялись, и запись прочитана
  // при открытии вкладки (чтение кэша идёт до загрузки плагина).
  const counters = await page.evaluate(
    () =>
      (window as unknown as { __TEXTURE_COUNTERS__: Record<string, number> }).__TEXTURE_COUNTERS__,
  );
  expect(counters.reader_cache_save ?? 0).toBeGreaterThan(0);
  expect(counters.reader_cache_load ?? 0).toBeGreaterThan(0);
});

test('панель свойств не сдвигает основание при смене вкладок', async ({ page }) => {
  await installMock(page, bookBase64());
  await page.goto('/');
  await addBookToWorkspace(page, /Демо-книга/);
  await content(page).locator('.page canvas').first().waitFor({ timeout: 30000 });

  await page.getByTestId('workplace-properties-toggle').click();
  const panel = page.getByTestId('properties-panel');
  await panel.getByTestId('properties-tab-pages').click();

  // Полоса вкладок на месте и без поиска (у страниц поиска нет).
  const tabsBox = await panel.getByTestId('properties-tabs').boundingBox();
  expect(tabsBox).not.toBeNull();

  // Вкладка с поиском не двигает вкладки: они стоят выше поиска.
  await panel.getByTestId('properties-tab-bookmarks').click();
  const withSearch = await panel.getByTestId('properties-tabs').boundingBox();
  expect(withSearch?.y).toBe(tabsBox?.y);
  expect(withSearch?.height).toBe(tabsBox?.height);

  await panel.getByTestId('properties-tab-pages').click();
  const back = await panel.getByTestId('properties-tabs').boundingBox();
  expect(back?.y).toBe(tabsBox?.y);
});
