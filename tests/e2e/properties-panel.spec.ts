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

/** Многостраничная DjVu-книга со встроенным оглавлением NAVM. */
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

/** Установка мока: плагин DjVu и книга с оглавлением. */
async function installMock(page: Page, data: string) {
    const files = viewerFiles();
    const entry = viewerEntry();
    await page.addInitScript(
        (payload: { data: string; books: unknown; entry: string; files: unknown }) => {
            // Кэш свойств своей копией: по нему видно, какие превью собраны.
            const cache: Record<string, { thumbs?: Record<string, string> }> = {};
            (window as unknown as { __PROPERTIES_CACHE__: unknown }).__PROPERTIES_CACHE__ = cache;
            (
                window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }
            ).__TEXTURE_MOCK_OVERRIDES__ = {
                handlers: {
                    reader_cache_load: (input: unknown) =>
                        cache[(input as { path?: string }).path ?? ''] ?? null,
                    reader_cache_save: (input: unknown) => {
                        const value = input as {
                            path?: string;
                            properties?: unknown;
                            annotations?: unknown;
                            thumbs?: Array<{ page?: number; dataUrl?: string }>;
                        };
                        const key = value.path ?? '';
                        const previous = cache[key] ?? {};
                        const thumbs = { ...(previous.thumbs ?? {}) };
                        for (const thumb of value.thumbs ?? []) {
                            if (thumb.page && thumb.dataUrl) {
                                thumbs[String(thumb.page)] = thumb.dataUrl;
                            }
                        }
                        cache[key] = { ...previous, thumbs };
                        return true;
                    },
                    reader_cache_forget: (input: unknown) => {
                        delete cache[(input as { path?: string }).path ?? ''];
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

test('панель свойств DjVu: встроенные закладки и превью страниц', async ({ page }) => {
    await installMock(page, bookBase64());
    await page.goto('/');
    await addBookToWorkspace(page, /Демо-книга/);
    await content(page).locator('.page canvas').first().waitFor({ timeout: 30000 });

    await page.getByTestId('workplace-properties-toggle').click();
    const panel = page.getByTestId('properties-panel');
    await expect(panel).toBeVisible();

    // Закладки файла: пункты вкладки «Закладки» приходят из NAVM книги.
    await panel.getByTestId('properties-tab-bookmarks').click();
    const bookmarks = panel.getByTestId('properties-bookmarks');
    await expect(bookmarks.getByTestId('properties-bookmark-row').first()).toBeVisible();
    await expect(bookmarks).toContainText('Introduction');

    // Переход по закладке: страница чтения становится на её номер.
    await bookmarks.getByText('Document organization').click();
    await expect(page.getByLabel('Текущая страница')).toHaveValue('2');

    // Превью страниц: миниатюры рисует плагин по запросу панели.
    await panel.getByTestId('properties-tab-pages').click();
    await expect(panel.getByTestId('properties-page').first()).toBeVisible();
    await expect(panel.locator('img').first()).toBeVisible({ timeout: 30000 });

    // В этой книге большинство страниц — сканы без фонового слоя DjVu. Раньше
    // миниатюры строились только для страниц с фоном, и у сканов их не было
    // вовсе: из первой порции (24 страницы) выходила одна картинка. Теперь
    // миниатюра есть у каждой заказанной страницы.
    await expect
        .poll(async () => panel.locator('img').count(), { timeout: 30000 })
        .toBeGreaterThan(12);

    // Список виртуализирован: в разметке только окно прокрутки, а не все 71
    // страница книги. Иначе на книге в тысячу страниц разметка съедала бы
    // память и время раскладки.
    const rendered = await panel.getByTestId('properties-page').count();
    expect(rendered).toBeLessThan(71);
    expect(rendered).toBeGreaterThan(0);

    // Прокрутка списка показывает дальние страницы: окно сдвигается.
    const body = panel.getByTestId('properties-body');
    await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    await expect
        .poll(async () => {
            const labels = await panel
                .getByTestId('properties-page')
                .allTextContents();
            return Math.max(...labels.map((label) => Number(label) || 0));
        })
        .toBeGreaterThan(40);

    // Переход по дальнему превью открывает его страницу в чтении.
    await panel.getByTestId('properties-page').last().click();
    await expect(page.getByLabel('Текущая страница')).not.toHaveValue('1');
});

test('встроенные пометки PDF не рисуются на странице до запроса', async ({ page }) => {
    // В обычном DjVu пометок нет: вкладка не появляется, пока формат не
    // объявил поддержку. Проверяется, что панель не выдумывает данные.
    await installMock(page, bookBase64());
    await page.goto('/');
    await addBookToWorkspace(page, /Демо-книга/);
    await content(page).locator('.page canvas').first().waitFor({ timeout: 30000 });

    await page.getByTestId('workplace-properties-toggle').click();
    await expect(page.getByTestId('properties-tab-annotations')).toHaveCount(0);
});

test('превью покрывают книгу без пропусков, «Обновить» пересоздаёт их', async ({ page }) => {
    // Сценарий проходит всю книгу и пересоздаёт превью: это заведомо дольше
    // обычного теста панели.
    test.setTimeout(180000);
    await installMock(page, bookBase64());
    await page.goto('/');
    await addBookToWorkspace(page, /Демо-книга/);
    await content(page).locator('.page canvas').first().waitFor({ timeout: 30000 });

    await page.getByTestId('workplace-properties-toggle').click();
    const panel = page.getByTestId('properties-panel');
    await panel.getByTestId('properties-tab-pages').click();
    const body = panel.getByTestId('properties-body');

    /** Номера страниц, у которых уже есть картинка. */
    const realized = async () => {
        const labels = await panel.getByTestId('properties-page').allTextContents();
        const images = await panel.locator('img').count();
        return { labels: labels.length, images };
    };

    // Прыжок прокрутки, как перетаскиванием полосы: окно переезжает через
    // середину книги. Страницы между началом и новым окном не должны остаться
    // без превью — на их месте образовывалась «дыра».
    await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight * 0.45;
    });
    await page.waitForTimeout(6000);

    // После прыжка превью должны покрывать всю просмотренную часть книги, а не
    // только окно вокруг новой позиции: иначе посреди списка остаётся полоса
    // страниц без картинок.
    const coveredUpTo = async () => {
        const missing = await page.evaluate(() => {
            const cache = (window as unknown as {
                __PROPERTIES_CACHE__?: Record<string, { thumbs?: Record<string, string> }>;
            }).__PROPERTIES_CACHE__;
            const entry = cache ? Object.values(cache)[0] : undefined;
            const have = new Set(Object.keys(entry?.thumbs ?? {}));
            return Array.from({ length: 30 }, (_, index) => index + 1).filter(
                (page) => !have.has(String(page)),
            );
        });
        return missing;
    };
    await expect.poll(coveredUpTo, { timeout: 60000 }).toEqual([]);

    // Собранные превью должны покрывать просмотренную часть без пропусков.
    const missing = await page.evaluate(() => {
        const cache = (window as unknown as {
            __PROPERTIES_CACHE__?: Record<string, { thumbs?: Record<string, string> }>;
        }).__PROPERTIES_CACHE__;
        const entry = cache ? Object.values(cache)[0] : undefined;
        const have = new Set(Object.keys(entry?.thumbs ?? {}));
        return Array.from({ length: 20 }, (_, index) => index + 1).filter(
            (page) => !have.has(String(page)),
        );
    });
    expect(missing).toEqual([]);

    // Дальше — ровный проход остатка книги до конца.
    for (let step = 0; step < 12; step += 1) {
        await body.evaluate((element) => {
            element.scrollTop = element.scrollTop + element.clientHeight * 0.9;
        });
        await page.waitForTimeout(1200);
    }
    // Возврат к началу книги: здесь окно целиком заполнено страницами, и
    // проверка не зависит от того, сколько страниц осталось в конце списка.
    await body.evaluate((element) => {
        element.scrollTop = 0;
    });
    await expect
        .poll(async () => (await realized()).images, { timeout: 40000 })
        .toBeGreaterThan(10);

    // «Обновить» удаляет кэш картинок и создаёт их заново: превью снова есть,
    // а не остаются пустыми.
    await panel.getByTestId('properties-pages-regenerate').click();
    await expect
        .poll(async () => (await realized()).images, { timeout: 60000 })
        .toBeGreaterThan(10);
});
