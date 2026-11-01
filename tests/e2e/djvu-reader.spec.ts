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

/** Многостраничная DjVu-книга: виртуальный список держит лишь окно страниц. */
function multiDjvuBase64(): string {
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

/** Установка мока: плагин DjVu и книга формата djvu. */
async function installDjvuMock(page: Page, data = djvuBase64()) {
    const files = viewerFiles();
    const entry = viewerEntry();
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
                        // Как и ядро, порция выравнивается по трём байтам: тогда
                        // её base64 без паддинга и содержимое собирается склейкой.
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

/** Открытие DjVu вкладкой рабочего места. */
async function openDjvu(page: Page, data?: string) {
    await installDjvuMock(page, data);
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
    // Как в PDF: 100 % — абсолютный естественный размер страницы, и изменение
    // размера окна его НЕ меняет.
    await expect(page.getByTestId('reader-zoom')).toHaveText('100%');
    const pageEl = frame.locator('.page').first();
    const widthAt = async () => Math.round((await pageEl.boundingBox())?.width ?? 0);
    // carte.djvu: 4200 px при 300 dpi → 1344 CSS-пикселя (4200 × 96 / 300).
    expect(await widthAt()).toBe(1344);
    await page.setViewportSize({ width: 900, height: 700 });
    await expect.poll(widthAt).toBe(1344);
    await expect(page.getByLabel('Текущая страница')).toHaveValue('1');
    await expect(page.getByTestId('reader-page-count')).toHaveText('/ 1');
});

test('поиск по книге DjVu: находит текст и показывает найденное на странице', async ({ page }) => {
    await openDjvu(page);

    await page.getByTestId('note-toolbar').getByRole('button', { name: 'Поиск по книге' }).click();
    const search = page.getByTestId('reader-search');
    // Запрос короче двух букв не ищется, поэтому берётся слово из текстового слоя.
    const spans = await content(page).locator('.textLayer span').allTextContents();
    const word =
        spans
            .flatMap((text) => text.trim().split(/\s+/))
            .find((part) => part.length >= 3)
            ?.slice(0, 4) ?? '';
    expect(word.length).toBeGreaterThanOrEqual(2);

    await search.getByRole('textbox', { name: 'Поиск по книге' }).fill(word);

    // Счётчик приходит от плагина, найденное подсвечено на странице.
    await expect(search.getByTestId('reader-search-counter')).toHaveText(/\d/);
    // Найденное — отдельный слой полос над растром, а не разметка в прозрачном
    // текстовом слое: заливка в нём ложилась плёнкой поверх букв.
    await expect(content(page).locator('.search-layer .search-hit').first()).toBeAttached();
});

test('масштаб меняет размер страницы DjVu, не сбрасывая номер', async ({ page }) => {
    await openDjvu(page);
    const pageEl = content(page).locator('.page').first();
    const before = await pageEl.boundingBox();
    const zoomBefore = await page.getByTestId('reader-zoom').textContent();
    await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
    await expect.poll(async () => page.getByTestId('reader-zoom').textContent()).not.toBe(zoomBefore);
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
});

test('многостраничная книга держит в разметке только окно страниц', async ({ page }) => {
    await openDjvu(page, multiDjvuBase64());
    const frame = content(page);
    await frame.locator('.page canvas').first().waitFor({ timeout: 30000 });
    // Книга на 71 страницу: в DOM лишь несколько, остальное — распорки списка.
    const rendered = await frame.locator('.page').count();
    expect(rendered).toBeLessThan(40);
    await expect(frame.locator('.page-spacer')).toHaveCount(2);
    const before = await frame.locator('.page').first().getAttribute('data-page');
    // Прокрутка в середину книги: окно страниц переезжает, число узлов не растёт.
    await frame.locator('#viewer').evaluate((element) => {
        element.scrollTop = element.scrollHeight * 0.5;
        element.dispatchEvent(new Event('scroll'));
    });
    await expect
        .poll(async () => frame.locator('.page').first().getAttribute('data-page'))
        .not.toBe(before);
    expect(await frame.locator('.page').count()).toBeLessThan(40);
    await expect(frame.locator('.page canvas').first()).toBeVisible();
});

test('страница открывается по центру области чтения', async ({ page }) => {
    // Узкое окно: страница 1344 CSS-пикселя шире области чтения, поэтому её
    // середина должна оказаться в середине окна, а не оставаться за краем.
    await page.setViewportSize({ width: 700, height: 600 });
    await openDjvu(page);
    const frame = content(page);
    await frame.locator('.page canvas').first().waitFor({ timeout: 30000 });
    const geometry = await frame.locator('#viewer').evaluate((element) => {
        const viewer = element as HTMLElement;
        const pageEl = viewer.querySelector('.page') as HTMLElement;
        const viewerBox = viewer.getBoundingClientRect();
        const pageBox = pageEl.getBoundingClientRect();
        return {
            scrollLeft: Math.round(viewer.scrollLeft),
            overflow: Math.round(viewer.scrollWidth - viewer.clientWidth),
            pageCenter: Math.round(pageBox.left + pageBox.width / 2 - viewerBox.left),
            viewerCenter: Math.round(viewer.clientWidth / 2),
        };
    });
    expect(geometry.overflow).toBeGreaterThan(0);
    expect(geometry.scrollLeft).toBe(Math.round(geometry.overflow / 2));
    expect(Math.abs(geometry.pageCenter - geometry.viewerCenter)).toBeLessThanOrEqual(2);
});

/** Доля чернил строки, попавших в рамку выделения (то, что видит пользователь). */
async function wordInkCoverage(
    page: Page,
    frame: ReturnType<typeof content>,
    target: { x: number; y: number },
): Promise<number | null> {
    const iframeBox = await page.locator('iframe[title="Содержимое книги"]').boundingBox();
    if (!iframeBox) {
        return null;
    }
    await page.mouse.dblclick(iframeBox.x + target.x, iframeBox.y + target.y);
    await page.waitForTimeout(150);
    return frame.locator('#viewer').evaluate(() => {
        const band = document.querySelector('.selection-layer .selection-band') as HTMLElement | null;
        if (!band) {
            return null;
        }
        const pageEl = band.closest('.page') as HTMLElement;
        const canvas = pageEl.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) {
            return null;
        }
        const bandBox = band.getBoundingClientRect();
        const canvasBox = canvas.getBoundingClientRect();
        const ratioX = canvas.width / canvasBox.width;
        const ratioY = canvas.height / canvasBox.height;
        let pixels: Uint8ClampedArray;
        try {
            pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        } catch {
            return null;
        }
        const isInk = (x: number, y: number): boolean => {
            const index = (y * canvas.width + x) * 4;
            if (pixels[index + 3] < 128) {
                return false;
            }
            return (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3 < 100;
        };
        const x0 = Math.max(0, Math.floor((bandBox.left - canvasBox.left) * ratioX));
        const x1 = Math.min(canvas.width - 1, Math.ceil((bandBox.right - canvasBox.left) * ratioX));
        // Полоса строки: рамка с малым запасом, соседние строки не захватываются.
        const pad = bandBox.height * ratioY * 0.08;
        const y0 = Math.max(0, Math.floor((bandBox.top - canvasBox.top) * ratioY - pad));
        const y1 = Math.min(canvas.height - 1, Math.ceil((bandBox.bottom - canvasBox.top) * ratioY + pad));
        if (x1 <= x0 || y1 <= y0) {
            return null;
        }
        let inside = 0;
        let strip = 0;
        for (let y = y0; y <= y1; y += 1) {
            for (let x = x0; x <= x1; x += 1) {
                if (!isInk(x, y)) {
                    continue;
                }
                strip += 1;
                const cx = x / ratioX + canvasBox.left;
                const cy = y / ratioY + canvasBox.top;
                if (cx >= bandBox.left && cx <= bandBox.right && cy >= bandBox.top && cy <= bandBox.bottom) {
                    inside += 1;
                }
            }
        }
        return strip > 0 ? inside / strip : null;
    });
}

/** Слова, целиком видимые и лежащие в окне канваса. */
async function visibleWords(frame: ReturnType<typeof content>, limit = 4) {
    return frame.locator('#viewer').evaluate((element, max) => {
        const viewer = element as HTMLElement;
        const viewerBox = viewer.getBoundingClientRect();
        const found: Array<{ x: number; y: number; text: string }> = [];
        for (const pageEl of viewer.querySelectorAll('.page')) {
            const canvas = pageEl.querySelector('canvas') as HTMLCanvasElement | null;
            if (!canvas) {
                continue;
            }
            const canvasBox = canvas.getBoundingClientRect();
            for (const span of pageEl.querySelectorAll('.textLayer span')) {
                const box = span.getBoundingClientRect();
                if (box.width < 25) {
                    continue;
                }
                if (box.top < viewerBox.top + 15 || box.bottom > viewerBox.bottom - 15) {
                    continue;
                }
                if (box.top < canvasBox.top - 2 || box.bottom > canvasBox.bottom + 2) {
                    continue;
                }
                if (box.left < canvasBox.left + 2 || box.right > canvasBox.right - 2) {
                    continue;
                }
                found.push({
                    x: box.left + box.width / 2,
                    y: box.top + box.height / 2,
                    text: (span.textContent ?? '').trim().slice(0, 12),
                });
                if (found.length >= max) {
                    return found;
                }
            }
        }
        return found;
    }, limit);
}

test('выделение слов совпадает с видимым текстом', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    // Многостраничная книга с текстом: у карты (carte) тёмный фон, и порог
    // чернил в замере захватывал бы его.
    await openDjvu(page, multiDjvuBase64());
    const frame = content(page);
    await frame.locator('.page canvas').first().waitFor({ timeout: 40000 });
    // Двойной клик по слову и выделение нескольких строк: рамка выделения
    // строится по чернилам растра, а слова одной строки имеют общую вертикаль.
    const check = () =>
        frame.locator('#viewer').evaluate(() => {
            const viewer = document.getElementById('viewer') as HTMLElement;
            const viewerBox = viewer.getBoundingClientRect();
            const pageEl = [...viewer.querySelectorAll('.page')].find((el) => el.querySelector('canvas')) as HTMLElement;
            const canvas = pageEl.querySelector('canvas') as HTMLCanvasElement;
            const canvasBox = canvas.getBoundingClientRect();
            const ratioX = canvas.width / canvasBox.width;
            const ratioY = canvas.height / canvasBox.height;
            let pixels: Uint8ClampedArray;
            try {
                pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
            } catch {
                return null;
            }
            const isInk = (x: number, y: number): boolean => {
                const index = (y * canvas.width + x) * 4;
                if (pixels[index + 3] < 128) {
                    return false;
                }
                return (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3 < 100;
            };
            // Слова строки: у них одна вертикаль и высота.
            const wordSpans = [...pageEl.querySelectorAll('.textLayer span')].filter((span) => {
                const box = span.getBoundingClientRect();
                return box.top > viewerBox.top + 150 && box.bottom < viewerBox.bottom - 150 && box.width > 25;
            });
            if (wordSpans.length < 6) {
                return null;
            }
            // Выделение от первого слова до конца слова ниже — по нескольким строкам.
            const first = wordSpans[0];
            const last = wordSpans[Math.min(10, wordSpans.length - 1)];
            const range = document.createRange();
            range.setStart(first.firstChild as Node, 0);
            range.setEnd(last.firstChild as Node, (last.textContent ?? '').length);
            const selection = window.getSelection() as Selection;
            selection.removeAllRanges();
            selection.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
            const bands = [...pageEl.querySelectorAll('.selection-band')];
            // Чернила каждого выделенного слова и их попадание в его полосу.
            // Слово засчитывается той полосе, в чей вертикальный промежуток
            // попадает его центр — так строки не смешиваются.
            const selectedSpans = wordSpans.slice(0, Math.min(11, wordSpans.length));
            const coverages: number[] = [];
            for (const span of selectedSpans) {
                const wordBox = span.getBoundingClientRect();
                // Полоса своего слова — та, что накрывает его и по горизонтали, и
                // по вертикали. По одной горизонтали находится полоса соседней
                // строки (у строк общий диапазон столбцов), и замер мерил бы
                // чернила слова против чужой полосы.
                let band: Element | null = null;
                let bestOverlap = 0;
                for (const item of bands) {
                    const box = item.getBoundingClientRect();
                    const overlapX = Math.min(box.right, wordBox.right) - Math.max(box.left, wordBox.left);
                    const overlapY = Math.min(box.bottom, wordBox.bottom) - Math.max(box.top, wordBox.top);
                    if (overlapX <= 0 || overlapY <= 0) {
                        continue;
                    }
                    if (overlapX * overlapY > bestOverlap) {
                        bestOverlap = overlapX * overlapY;
                        band = item;
                    }
                }
                // Слово без своей полосы не входит в выделение — не считается.
                if (!band) {
                    continue;
                }
                const box = band.getBoundingClientRect();
                const x0 = Math.max(0, Math.floor((wordBox.left - canvasBox.left) * ratioX));
                const x1 = Math.min(canvas.width - 1, Math.ceil((wordBox.right - canvasBox.left) * ratioX));
                const y0 = Math.max(0, Math.floor((wordBox.top - canvasBox.top) * ratioY));
                const y1 = Math.min(canvas.height - 1, Math.ceil((wordBox.bottom - canvasBox.top) * ratioY));
                let inside = 0;
                let total = 0;
                for (let y = y0; y <= y1; y += 1) {
                    for (let x = x0; x <= x1; x += 1) {
                        if (!isInk(x, y)) {
                            continue;
                        }
                        total += 1;
                        const cy = y / ratioY + canvasBox.top;
                        if (cy >= box.top && cy <= box.bottom) {
                            inside += 1;
                        }
                    }
                }
                if (total > 0) {
                    coverages.push(inside / total);
                }
            }
            const heights = new Set<string>();
            for (const span of wordSpans.slice(0, 6)) {
                heights.add(`${span.style.top}|${span.style.height}`);
            }
            return { bands: bands.length, coverages, distinctLineHeights: heights.size, selected: selection.toString().trim().slice(0, 30) };
        });
    const first = await check();
    expect(first).not.toBeNull();
    expect(first!.selected.length).toBeGreaterThan(5);
    expect(first!.bands).toBeGreaterThan(0);
    // Доля чернил выделенных слов, попавших в полосы: каждое слово своей полосы.
    expect(first!.coverages.length).toBeGreaterThan(0);
    const worst = Math.min(...first!.coverages);
    expect(worst, JSON.stringify(first!.coverages)).toBeGreaterThan(0.85);
    // Слова одной строки делят вертикаль: иначе полосы не стыкуются.
    expect(first!.distinctLineHeights).toBeLessThan(6);
});

test('прокрутка внутри увеличенной страницы дорисовывает низ', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 500 });
    await openDjvu(page);
    const frame = content(page);
    await frame.locator('.page canvas').first().waitFor({ timeout: 30000 });
    // Сильное увеличение: страница не помещается в канвас целиком и рисуется
    // окном видимой области. Прокрутка внутри неё уводит видимую часть за
    // пределы канваса — низ должен дорисовываться, а не оставаться пустым.
    for (let step = 0; step < 6; step += 1) {
        await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
    }
    await expect(page.getByTestId('reader-zoom')).not.toHaveText('100%');
    const coverage = () =>
        frame.locator('#viewer').evaluate((element) => {
            const viewer = element as HTMLElement;
            const viewerBox = viewer.getBoundingClientRect();
            let coveredHeight = 0;
            for (const canvas of viewer.querySelectorAll('.page canvas')) {
                const box = canvas.getBoundingClientRect();
                coveredHeight += Math.max(
                    0,
                    Math.min(box.bottom, viewerBox.bottom) - Math.max(box.top, viewerBox.top),
                );
            }
            return viewer.clientHeight > 0 ? coveredHeight / viewer.clientHeight : 0;
        });
    await expect.poll(coverage, { timeout: 20000 }).toBeGreaterThan(0.9);
    for (const delta of [400, 700]) {
        await frame.locator('#viewer').evaluate((element, step) => {
            element.scrollTop += step;
            element.dispatchEvent(new Event('scroll'));
        }, delta);
        await expect.poll(coverage, { timeout: 20000 }).toBeGreaterThan(0.9);
    }
});

test('рамка слова стоит на его буквах, а не на соседней строке', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await openDjvu(page, multiDjvuBase64());
    const frame = content(page);
    await frame.locator('.page canvas').first().waitFor({ timeout: 40000 });
    // Симптом, который видит пользователь: рамка слова уезжает на строку выше
    // его букв. Проверяется по растру: центр рамки должен попадать в ту строку
    // чернил, где у слова в его же столбцах есть буквы. Строки ищутся по
    // проекции чернил, поэтому метрика не зависит от самих рамок.
    const measure = () =>
        frame.locator('#viewer').evaluate(() => {
            const viewer = document.getElementById('viewer') as HTMLElement;
            const viewerBox = viewer.getBoundingClientRect();
            const pageEl = [...viewer.querySelectorAll('.page')].find((el) => el.querySelector('canvas')) as HTMLElement;
            const canvas = pageEl.querySelector('canvas') as HTMLCanvasElement;
            const canvasBox = canvas.getBoundingClientRect();
            const ratioX = canvas.width / canvasBox.width;
            const ratioY = canvas.height / canvasBox.height;
            const dark = document.documentElement.dataset.readerTheme === 'dark';
            let pixels: Uint8ClampedArray;
            try {
                pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
            } catch {
                return null;
            }
            const isInk = (x: number, y: number): boolean => {
                const index = (y * canvas.width + x) * 4;
                if (pixels[index + 3] < 128) {
                    return false;
                }
                const luminance = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
                return dark ? luminance > 150 : luminance < 100;
            };
            const spans = [...pageEl.querySelectorAll('.textLayer span')].filter(
                (span) => span.getBoundingClientRect().width > 15,
            ) as HTMLElement[];
            if (spans.length < 10) {
                return null;
            }
            // Строки чернил по столбцам слов.
            const mask = new Uint8Array(canvas.width);
            for (const span of spans) {
                const box = span.getBoundingClientRect();
                const x0 = Math.max(0, Math.floor((box.left - canvasBox.left) * ratioX));
                const x1 = Math.min(canvas.width - 1, Math.ceil((box.right - canvasBox.left) * ratioX));
                for (let x = x0; x <= x1; x += 1) {
                    mask[x] = 1;
                }
            }
            const profile: number[] = [];
            for (let y = 0; y < canvas.height; y += 1) {
                let ink = 0;
                for (let x = 0; x < canvas.width; x += 1) {
                    if (mask[x] === 1 && isInk(x, y)) {
                        ink += 1;
                    }
                }
                profile.push(ink);
            }
            const peak = Math.max(...profile);
            if (peak === 0) {
                return null;
            }
            const floor = peak * 0.12;
            const rows: Array<{ top: number; bottom: number }> = [];
            let start = -1;
            for (let y = 0; y <= profile.length; y += 1) {
                const on = y < profile.length && profile[y] >= floor;
                if (on) {
                    if (start < 0) {
                        start = y;
                    }
                } else if (start >= 0) {
                    rows.push({ top: start, bottom: y - 1 });
                    start = -1;
                }
            }
            const heights = rows.map((row) => row.bottom - row.top + 1).sort((a, b) => a - b);
            const typical = heights[Math.floor(heights.length / 2)] || 1;
            const real = rows.filter((row) => row.bottom - row.top + 1 >= typical * 0.5);
            if (real.length < 4) {
                return null;
            }
            const steps: number[] = [];
            for (let index = 1; index < real.length; index += 1) {
                steps.push(real[index].top - real[index - 1].top);
            }
            steps.sort((a, b) => a - b);
            const pitch = steps[Math.floor(steps.length / 2)] || typical;
            // Для каждого видимого слова: центр рамки против строки его букв.
            let ok = 0;
            let byLine = 0;
            const samples: string[] = [];
            for (const span of spans) {
                const box = span.getBoundingClientRect();
                if (box.top < canvasBox.top || box.bottom > canvasBox.bottom) {
                    continue;
                }
                if (box.top < viewerBox.top + 20 || box.bottom > viewerBox.bottom - 20) {
                    continue;
                }
                const x0 = Math.max(0, Math.floor((box.left - canvasBox.left) * ratioX));
                const x1 = Math.min(canvas.width - 1, Math.ceil((box.right - canvasBox.left) * ratioX));
                if (x1 <= x0) {
                    continue;
                }
                // Мелкий текст (колонтитулы, сноски) не проверяется: в разметке
                // файла его зоны мельче и смещены относительно букв, и это
                // свойство самого файла, а не выравнивания. Строки такого текста
                // отсекаются фильтром высоты ниже, поэтому и слова отсекаются по
                // той же мере — иначе слово остаётся без своей строки и замер
                // сравнивает его с чужими буквами.
                const boxCenter = ((box.top + box.bottom) / 2 - canvasBox.top) * ratioY;
                let best = -1;
                let bestDistance = Number.POSITIVE_INFINITY;
                for (let index = 0; index < real.length; index += 1) {
                    let ink = 0;
                    for (let y = real[index].top; y <= real[index].bottom && ink <= 8; y += 1) {
                        for (let x = x0; x <= x1; x += 1) {
                            if (isInk(x, y)) {
                                ink += 1;
                                if (ink > 8) {
                                    break;
                                }
                            }
                        }
                    }
                    if (ink <= 8) {
                        continue;
                    }
                    const distance = Math.abs((real[index].top + real[index].bottom) / 2 - boxCenter);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        best = index;
                    }
                }
                if (best < 0) {
                    continue;
                }
                // Слово без своего ряда букв (строка отсечена как мелкий текст):
                // расстояние до ближайшей оставшейся строки больше шага, и
                // сравнение было бы с чужими буквами. Такое слово не считается.
                if (bestDistance > pitch) {
                    continue;
                }
                // Смещение на строку: центр рамки ушёл от строки её букв почти на
                // целый межстрочный шаг. Половина шага — обычный запас разметки.
                if (bestDistance > pitch * 0.75) {
                    byLine += 1;
                    if (samples.length < 12) {
                        samples.push(
                            `${(span.textContent ?? '').trim().slice(0, 6)}|h=${Math.round(box.height * ratioY)}|d=${Math.round(bestDistance)}`,
                        );
                    }
                } else {
                    ok += 1;
                }
            }
            if (ok + byLine === 0) {
                return null;
            }
            return { ok, byLine, pitch: Math.round(pitch / ratioY), samples };
        });
    const check = async () => {
        const result = await measure();
        expect(result).not.toBeNull();
        // Рамки стоят на своих строках: смещённых на строку — считанные проценты.
        expect(result!.byLine / (result!.ok + result!.byLine), JSON.stringify(result)).toBeLessThan(0.05);
        expect(result!.ok, JSON.stringify(result)).toBeGreaterThan(0);
    };
    await check();
    await page.getByLabel('Тёмная тема области чтения').click();
    await expect(frame.locator('html')).toHaveAttribute('data-reader-theme', 'dark');
    await page.waitForTimeout(3000);
    await check();
    for (const zoom of [70, 150]) {
        const current = Number.parseInt((await page.getByTestId('reader-zoom').textContent()) ?? '100', 10);
        const name = zoom > current ? 'Увеличить масштаб' : 'Уменьшить масштаб';
        for (let index = 0; index < Math.abs(zoom - current) / 10; index += 1) {
            await page.getByRole('button', { name }).click();
        }
        await page.waitForTimeout(3000);
        await check();
    }
});

/** Протяжка мышью внутри области содержимого от точки к точке. */
async function dragInContent(
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
) {
    const iframe = await page.locator('iframe[title="Содержимое книги"]').boundingBox();
    if (!iframe) {
        throw new Error('область содержимого не найдена');
    }
    await page.mouse.move(iframe.x + from.x, iframe.y + from.y);
    await page.mouse.down();
    await page.mouse.move(iframe.x + to.x, iframe.y + to.y, { steps: 8 });
    await page.mouse.up();
}

/** Текущее выделение в области содержимого. */
async function selectedText(page: Page): Promise<string> {
    return content(page)
        .locator('#viewer')
        .evaluate((element) => element.ownerDocument.getSelection()?.toString() ?? '');
}

/** Геометрия первой страницы, её первого слова текстового слоя и видимой области. */
async function pageGeometry(page: Page) {
    return content(page)
        .locator('.page')
        .first()
        .evaluate((element) => {
            const pageBox = element.getBoundingClientRect();
            const viewerBox = (
                element.ownerDocument.getElementById('viewer') as HTMLElement
            ).getBoundingClientRect();
            const span = element.querySelector('.textLayer span') as HTMLElement | null;
            if (!span) {
                return null;
            }
            const box = span.getBoundingClientRect();
            return {
                page: { x: pageBox.x, y: pageBox.y, right: pageBox.right, bottom: pageBox.bottom },
                viewer: { top: viewerBox.top, bottom: viewerBox.bottom },
                word: { x: box.x, y: box.y, right: box.right, middle: box.y + box.height / 2 },
            };
        });
}

// Браузер достраивает выделение от ближайшего текста до указателя. Поэтому
// протяжка, начатая в поле страницы (мимо слова), выделяла не текст, а область
// всего документа. Выделение должно начинаться только на слове текстового слоя.
test('протяжка с поля страницы не выделяет текст DjVu', async ({ page }) => {
    await openDjvu(page);
    const geometry = await pageGeometry(page);
    expect(geometry).not.toBeNull();
    await dragInContent(
        page,
        { x: geometry!.page.x + 30, y: geometry!.viewer.bottom - 40 },
        { x: geometry!.word.x + 30, y: geometry!.word.middle },
    );
    expect(await selectedText(page)).toBe('');
});

test('двойной щелчок по слову выделяет слово в DjVu', async ({ page }) => {
    await openDjvu(page);
    const geometry = await pageGeometry(page);
    expect(geometry).not.toBeNull();
    const iframe = await page.locator('iframe[title="Содержимое книги"]').boundingBox();
    await page.mouse.dblclick(
        iframe!.x + geometry!.word.x + 8,
        iframe!.y + geometry!.word.middle,
    );
    expect((await selectedText(page)).trim().length).toBeGreaterThan(0);
    await expect(content(page).locator('.selection-layer')).toHaveCount(1);
});

// Клавиши в книге формата пересылаются в приложение: собственной навигации у
// плагина нет, распознанная комбинация становится действием единого реестра.
test('клавиши книги DjVu обрабатывает реестр приложения', async ({ page }) => {
    await openDjvu(page);
    await content(page).locator('#viewer').click();

    // Одна страница: прокрутка к концу и к началу не ломает содержимое,
    // а Ctrl+F открывает общую панель поиска по книге.
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await page.keyboard.press('Control+f');

    const search = page.getByTestId('reader-search');
    await expect(search).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);
    await expect(content(page).locator('.page canvas').first()).toBeVisible();
});
