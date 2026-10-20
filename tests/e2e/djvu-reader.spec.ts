import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBookToWorkspace } from './workplace-area';

/** Корень репозитория. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Точка входа модуля рисования плагина DjVu из развёрнутых ресурсов. */
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
    if (extension === 'css') {
        return 'text/css';
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

/** DjVu-книга с текстовым слоем (одна страница). */
function djvuBase64(): string {
    return readFileSync(resolve(ROOT, 'tests', 'fixtures', 'carte.djvu')).toString('base64');
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

/** Установка мока: плагин DjVu и книга формата djvu. */
async function installDjvuMock(page: Page) {
    const files = viewerFiles();
    const entry = viewerEntry();
    const data = djvuBase64();
    await page.addInitScript(
        (payload: { data: string; books: unknown; entry: string; files: unknown }) => {
            (
                window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }
            ).__TEXTURE_MOCK_OVERRIDES__ = {
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
                        const request = (input ?? {}) as { offset?: number; length?: number };
                        const bytes = atob(payload.data);
                        const offset = request.offset ?? 0;
                        const length = Math.min(request.length ?? 64 * 1024, 64 * 1024);
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

/** Открытие DjVu вкладкой рабочего места. */
async function openDjvu(page: Page) {
    await installDjvuMock(page);
    await page.goto('/');
    await addBookToWorkspace(page, /Демо-книга/);
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
    await content(page).locator('.page canvas').first().waitFor({ timeout: 30000 });
}

test('DjVu открывается плагином страницами с текстовым слоем', async ({ page }) => {
    await openDjvu(page);

    const frame = content(page);
    await expect(frame.locator('.page canvas').first()).toBeVisible();
    await expect(frame.locator('.page')).toHaveCount(1);
    await expect(frame.locator('.textLayer span').first()).toBeAttached();
    await expect(page.getByLabel('Текущая страница')).toHaveValue('1');
    await expect(page.getByTestId('reader-page-count')).toHaveText('/ 1');
});

test('масштаб меняет размер страницы DjVu, не сбрасывая номер', async ({ page }) => {
    await openDjvu(page);
    const pageEl = content(page).locator('.page').first();
    const before = await pageEl.boundingBox();
    await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
    await expect(page.getByTestId('reader-zoom')).toHaveText('110%');
    await expect
        .poll(async () => (await pageEl.boundingBox())?.width ?? 0)
        .toBeGreaterThan(before?.width ?? 0);
    await expect(page.getByLabel('Текущая страница')).toHaveValue('1');
});

test('тема области чтения перекрашивает страницу DjVu', async ({ page }) => {
    await openDjvu(page);
    const canvas = content(page).locator('.page canvas').first();
    /** Сумма каналов верхнего левого пикселя страницы. */
    const paperBrightness = () =>
        canvas.evaluate((element) => {
            const source = element as HTMLCanvasElement;
            const context = source.getContext('2d');
            if (!context) {
                return 0;
            }
            const pixel = context.getImageData(0, 0, 1, 1).data;
            return pixel[0] + pixel[1] + pixel[2];
        });
    const light = await paperBrightness();

    await page.getByLabel('Тёмная тема области чтения').click();
    await expect(content(page).locator('html')).toHaveAttribute('data-reader-theme', 'dark');
    await expect.poll(paperBrightness).toBeLessThan(light);
    await expect(page.getByLabel('Текущая страница')).toHaveValue('1');
    await expect(page.getByTestId('reader-zoom')).toHaveText('100%');
});
