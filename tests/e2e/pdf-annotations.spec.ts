import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBookToWorkspace } from './workplace-area';

/** Корень репозитория. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Точка входа модуля рисования плагина PDF из развёрнутых ресурсов. */
function viewerEntry(): string {
  return readFileSync(
    resolve(ROOT, 'src-tauri', 'resources', 'plugins', 'format-pdf', 'viewer', 'index.html'),
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
  const dir = resolve(ROOT, 'src-tauri', 'resources', 'plugins', 'format-pdf', 'viewer');
  return readdirSync(dir)
    .sort()
    .map((name) => ({
      path: name,
      mime: viewerMime(name),
      data: readFileSync(resolve(dir, name)).toString('base64'),
    }));
}

/** Книга с встроенными пометками: выделение и стикер. */
function bookBase64(): string {
  return readFileSync(resolve(ROOT, 'tests', 'fixtures', 'annotated.pdf')).toString('base64');
}

/** Каталог с книгой формата pdf. */
const PDF_BOOKS = {
  catalog: {
    books: [
      {
        id: 'demo-pdf',
        title: 'Демо-PDF',
        authors: [],
        tags: [],
        series: [],
        files: [{ kind: 'book', path: 'demo.pdf', format: 'pdf' }],
      },
    ],
  },
};

/** Установка мока: плагин PDF и книга с пометками. */
async function installMock(page: Page, data: string) {
  const files = viewerFiles();
  const entry = viewerEntry();
  await page.addInitScript(
    (payload: { data: string; books: unknown; entry: string; files: unknown }) => {
      (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
        handlers: {
          active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
          reader_formats: () => ['pdf'],
          reader_plugin_for_format: () => 'format-pdf',
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
    { data, books: PDF_BOOKS, entry, files },
  );
}

/** Область содержимого плагина. */
function content(page: Page) {
  return page.frameLocator('iframe[title="Содержимое книги"]');
}

test('встроенные пометки PDF: в панели есть, на странице — только по запросу', async ({ page }) => {
  await installMock(page, bookBase64());
  await page.goto('/');
  await addBookToWorkspace(page, /Демо-PDF/);
  await content(page).locator('.page canvas').first().waitFor({ timeout: 30000 });

  // По умолчанию пометки файла на странице не рисуются.
  await expect(content(page).locator('.file-annotation')).toHaveCount(0);

  await page.getByTestId('workplace-properties-toggle').click();
  const panel = page.getByTestId('properties-panel');
  await panel.getByTestId('properties-tab-annotations').click();

  // Анализ идёт по запросу при открытии вкладки: находятся две пометки.
  const rows = panel.getByTestId('properties-annotation-row');
  await expect(rows).toHaveCount(2, { timeout: 30000 });
  await expect(panel.getByTestId('properties-annotations')).toContainText(
    'Highlighted text on page one',
  );
  await expect(panel.getByTestId('properties-annotations')).toContainText('My embedded comment');
  await expect(panel.getByTestId('properties-annotations')).toContainText('Sticky note comment');

  // По умолчанию ни одна пометка файла не показана: это чужой слой, он не
  // должен смешиваться с заметками приложения.
  await expect(content(page).locator('.file-annotation')).toHaveCount(0);

  // Галочка показывает пометку на странице.
  await panel.getByTestId('properties-annotation-toggle').first().check();
  await expect(content(page).locator('.file-annotation')).toHaveCount(1);

  // Снятая галочка убирает её со страницы.
  await panel.getByTestId('properties-annotation-toggle').first().uncheck();
  await expect(content(page).locator('.file-annotation')).toHaveCount(0);

  // Кнопка «Показать» включает ровно одну пометку, остальные остаются скрытыми.
  await rows.first().click();
  await expect(content(page).locator('.file-annotation')).toHaveCount(1);
});

test('закрытие панели свойств снимает показ встроенной пометки', async ({ page }) => {
  await installMock(page, bookBase64());
  await page.goto('/');
  await addBookToWorkspace(page, /Демо-PDF/);
  await content(page).locator('.page canvas').first().waitFor({ timeout: 30000 });

  const toggle = page.getByTestId('workplace-properties-toggle');
  await toggle.click();
  const panel = page.getByTestId('properties-panel');
  await panel.getByTestId('properties-tab-annotations').click();
  const rows = panel.getByTestId('properties-annotation-row');
  await expect(rows).toHaveCount(2, { timeout: 30000 });

  await panel.getByTestId('properties-annotation-toggle').first().check();
  await expect(content(page).locator('.file-annotation')).toHaveCount(1);

  // Панель закрыта — пометка снята: без панели её нечем убрать.
  await toggle.click();
  await expect(panel).toHaveCount(0);
  await expect(content(page).locator('.file-annotation')).toHaveCount(0);
});
