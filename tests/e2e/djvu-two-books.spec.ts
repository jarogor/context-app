import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBookToWorkspace } from './workplace-area';

/** Корень репозитория. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Файлы модуля рисования плагина DjVu из развёрнутых ресурсов. */
function viewerFiles(): Array<{ path: string; mime: string; data: string }> {
  const dir = resolve(ROOT, 'src-tauri', 'resources', 'plugins', 'format-djvu', 'viewer');
  return readdirSync(dir)
    .sort()
    .map((name) => ({
      path: name,
      mime: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      data: readFileSync(resolve(dir, name)).toString('base64'),
    }));
}

/** Мок рабочего места с двумя книгами DjVu. */
async function installTwoBooks(page: Page) {
  const files = viewerFiles();
  const entry = readFileSync(
    resolve(ROOT, 'src-tauri', 'resources', 'plugins', 'format-djvu', 'viewer', 'index.html'),
    'utf8',
  );
  const first = readFileSync(resolve(ROOT, 'tests', 'fixtures', 'carte.djvu')).toString('base64');
  const second = readFileSync(resolve(ROOT, 'tests', 'fixtures', 'djvu3spec.djvu')).toString(
    'base64',
  );
  await page.addInitScript(
    (payload: { first: string; second: string; entry: string; files: unknown }) => {
      (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
        handlers: {
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
            const request = (input ?? {}) as {
              path?: string;
              offset?: number;
              length?: number;
            };
            const raw = String(request.path ?? '').includes('second')
              ? payload.second
              : payload.first;
            const bytes = atob(raw);
            const offset = request.offset ?? 0;
            // Порции выровнены по границе base64: иначе паддинг
            // промежуточной порции ломает склейку и `atob`.
            const requested = request.length ?? 262144;
            const length = Math.max(3, requested - (requested % 3));
            const slice = bytes.slice(offset, offset + length);
            const next = offset + slice.length;
            return {
              chunk: btoa(slice),
              next,
              total: bytes.length,
              done: next >= bytes.length,
            };
          },
          invoke_plugin_operation: () => ({
            catalog: {
              books: [
                {
                  id: 'first',
                  title: 'Первая книга',
                  authors: [],
                  series: [],
                  tags: [],
                  files: [{ kind: 'book', path: 'first.djvu', format: 'djvu' }],
                },
                {
                  id: 'second',
                  title: 'Вторая книга',
                  authors: [],
                  series: [],
                  tags: [],
                  files: [{ kind: 'book', path: 'second.djvu', format: 'djvu' }],
                },
              ],
            },
          }),
          get_workspaces: () => ({
            workspaces: [
              {
                id: 'ws-1',
                name: 'foo',
                created_at_millis: 1,
                opened_at_millis: 1,
                tabs: [],
                active_tab_id: null,
              },
            ],
            active_workspace_id: 'ws-1',
          }),
          save_workspaces: (value: unknown) => {
            const registry = (value as { workspaces?: unknown })?.workspaces;
            window.localStorage.setItem('workspaces', JSON.stringify(registry));
            return { ok: true };
          },
        },
      };
    },
    { first, second, entry, files },
  );
}

test('вторая книга DjVu открывается в том же рабочем месте', async ({ page }) => {
  await installTwoBooks(page);
  await page.goto('/');
  await addBookToWorkspace(page, /Первая книга/);
  await expect(
    page.frameLocator('iframe[title="Содержимое книги"]').locator('.page canvas').first(),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('reader-page-count')).toContainText('/ 1');

  // Вторая книга: кнопка добавления книги в шапке рабочего места.
  await page.getByRole('button', { name: /Добавить книгу/ }).click();
  const library = page.locator('main');
  const back = library.getByRole('button', { name: /К списку книг/ });
  if ((await back.count()) > 0) {
    await back.click();
  }
  await library.getByRole('button', { name: /Вторая книга/ }).click();
  await library.getByTestId('book-read-djvu').click();
  await expect(page.getByTestId('workplace-tab').last()).toHaveText('Вторая книга');

  // Регрессия: открытие второй книги не должно оставлять пустые страницы.
  const content = page.frameLocator('iframe[title="Содержимое книги"]').last();
  await expect(content.locator('.page canvas').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('reader-page-count')).toContainText('/ 71');
});
