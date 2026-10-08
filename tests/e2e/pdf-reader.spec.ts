import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Корень репозитория. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Точка входа модуля рисования плагина PDF.
 *
 * Берётся **развёрнутый ресурс**, который реально грузит приложение, а не
 * исходник: иначе устаревшая сборка плагина оставалась бы незамеченной.
 * Ресурс собирается `scripts/build-wasm-plugins.sh`; сервер тестов
 * (`npm run dev:test`) запускает сборку перед прогоном.
 */
function viewerEntry(): string {
    return readFileSync(
        resolve(ROOT, 'src-tauri', 'resources', 'plugins', 'workplace-pdf', 'viewer', 'index.html'),
        'utf8',
    );
}

/** Файлы модуля рисования плагина PDF (движок и worker из pdfjs-dist). */
function viewerFiles(): Array<{ path: string; mime: string; data: string }> {
    const build = resolve(ROOT, 'node_modules', 'pdfjs-dist', 'build');
    return [
        {
            path: 'pdf.mjs',
            mime: 'text/javascript',
            data: readFileSync(resolve(build, 'pdf.min.mjs')).toString('base64'),
        },
        {
            path: 'pdf.worker.mjs',
            mime: 'text/javascript',
            data: readFileSync(resolve(build, 'pdf.worker.min.mjs')).toString('base64'),
        },
    ];
}

/** Минимальный многостраничный PDF без текстового слоя. */
function buildPdf(pageCount: number): string {
    return buildPdfWithLines(pageCount, false);
}

/** PDF с заданным числом страниц; по желанию — две строки текста на странице. */
function buildPdfWithLines(pageCount: number, twoLines: boolean): string {
    const objects: string[] = [];
    const kids: string[] = [];
    // 1 — каталог, 2 — дерево страниц, далее по три объекта на страницу.
    for (let index = 0; index < pageCount; index += 1) {
        const pageId = 3 + index * 3;
        kids.push(`${pageId} 0 R`);
    }
    objects.push('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj');
    objects.push(`2 0 obj<</Type/Pages/Kids[${kids.join(' ')}]/Count ${pageCount}>>endobj`);
    for (let index = 0; index < pageCount; index += 1) {
        const pageId = 3 + index * 3;
        const contentId = pageId + 1;
        const text = twoLines
            ? `(Page ${index + 1}) Tj 0 -30 Td (Second line) Tj`
            : `(Page ${index + 1}) Tj`;
        const stream = `BT /F1 36 Tf 72 700 Td ${text} ET`;
        objects.push(
            `${pageId} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${contentId} 0 R/Resources<</Font<</F1 ${pageId + 2} 0 R>>>>>>endobj`,
        );
        objects.push(
            `${contentId} 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj`,
        );
        objects.push(`${pageId + 2} 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj`);
    }
    const header = '%PDF-1.4\n';
    const body = objects.join('\n') + '\n';
    return `${header}${body}trailer<</Root 1 0 R>>\n%%EOF`;
}

/** PDF в base64 (как его отдаёт ядро постранично). */
function pdfBase64(pageCount: number): string {
    return Buffer.from(buildPdf(pageCount), 'binary').toString('base64');
}

/** PDF в base64 с двумя строками текста на странице. */
function pdfBase64TwoLines(pageCount: number): string {
    return Buffer.from(buildPdfWithLines(pageCount, true), 'binary').toString('base64');
}

/** Каталог с книгой формата pdf, обслуживаемой плагином рабочего места. */
const PDF_BOOKS = {
    catalog: {
        books: [
            {
                id: 'demo-pdf',
                title: 'Демо-книга',
                authors: [],
                tags: [],
                series: [],
                files: [{ kind: 'book', path: 'demo-pdf.pdf', format: 'pdf' }],
            },
        ],
    },
};

/** Установка мока: плагин PDF и книга формата pdf. */
async function installPdfMock(page: Page, pageCount: number, twoLines = false) {
    const files = viewerFiles();
    const entry = viewerEntry();
    await page.addInitScript(
        (payload: { data: string; books: unknown; entry: string; files: unknown }) => {
            (
                window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }
            ).__TEXTURE_MOCK_OVERRIDES__ = {
                handlers: {
                    active_library: () => ({ path: '/demo-library', provider_name: 'library' }),
                    reader_formats: () => ['pdf'],
                    reader_plugin_for_format: () => 'workplace-pdf',
                    reader_viewer: () => payload.entry,
                    reader_viewer_files: () => payload.files,
                    reader_viewer_file: (input: unknown) => {
                        const path = (input as { path?: string }).path ?? '';
                        const file = (
                            payload.files as Array<{ path: string; data: string }>
                        ).find((item) => item.path === path);
                        return { path, data: file?.data ?? '' };
                    },
                    reader_book_chunk: (input: unknown) => {
                        const request = (input ?? {}) as { offset?: number; length?: number };
                        const bytes = atob(payload.data);
                        const offset = request.offset ?? 0;
                        // Порция нарезается независимо: каждая кодируется своим base64.
                        const length = Math.min(request.length ?? 5, 5);
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
        { data: twoLines ? pdfBase64TwoLines(pageCount) : pdfBase64(pageCount), books: PDF_BOOKS, entry, files },
    );
}

/** Открытие PDF вкладкой рабочего места. */
async function openPdf(page: Page, pageCount: number, twoLines = false) {
    await installPdfMock(page, pageCount, twoLines);
    await page.goto('/');
    await page.getByLabel('Рабочее место', { exact: true }).click();
    const open = page.getByTestId('workspace-open').first();
    if (await open.isVisible().catch(() => false)) {
        await open.click();
    }
    const library = page.locator('main');
    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await library.getByRole('button', { name: /Добавить в/ }).click();
    await pickWorkspaceIfAsked(page);
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
    // Готовность области содержимого: страницы построены, первая отрисована.
    await content(page).locator('.page canvas').first().waitFor({ timeout: 20000 });
}

/** Область содержимого плагина. */
function content(page: Page) {
    return page.frameLocator('iframe[title="Содержимое книги"]');
}

/** Выбор рабочего места в диалоге, если он появился при открытии книги. */
async function pickWorkspaceIfAsked(page: Page) {
    const list = page.getByTestId('workspace-picker-list');
    if (await list.isVisible().catch(() => false)) {
        await page.getByTestId('workspace-picker-item').first().click();
    }
}

/** Приведение области чтения к заданному масштабу (шаг кнопок — 10 %). */
async function setZoom(page: Page, target: number) {
    const readZoom = async () =>
        Number(((await page.getByTestId('reader-zoom').textContent()) ?? '100').replace('%', ''));
    let current = await readZoom();
    while (current < target) {
        await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
        current += 10;
    }
    while (current > target) {
        await page.getByRole('button', { name: 'Уменьшить масштаб' }).click();
        current -= 10;
    }
}

/** Отклонение канваса страницы от пиксельной сетки устройства. */
async function canvasDeviceAlignment(page: Page) {
    return content(page)
        .locator('.page')
        .first()
        .evaluate((element) => {
            const canvas = element.querySelector('canvas');
            if (!(canvas instanceof HTMLCanvasElement)) {
                return null;
            }
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const residual = (value: number) =>
                Math.abs(value * dpr - Math.round(value * dpr));
            return {
                backingW: Math.abs(canvas.width - rect.width * dpr),
                backingH: Math.abs(canvas.height - rect.height * dpr),
                left: residual(rect.left),
                top: residual(rect.top),
                width: residual(rect.width),
                height: residual(rect.height),
            };
        });
}

/** Наибольшее отклонение канваса от сетки устройства. */
async function alignmentError(page: Page) {
    const value = await canvasDeviceAlignment(page);
    if (!value) {
        return Number.POSITIVE_INFINITY;
    }
    return Math.max(
        value.backingW,
        value.backingH,
        value.left,
        value.top,
        value.width,
        value.height,
    );
}

/** Возврат на поверхность рабочего места после перезагрузки. */
async function reopenWorkplace(page: Page) {
    const workspace = page.getByLabel('Рабочее место', { exact: true });
    if ((await workspace.getAttribute('aria-pressed')) !== 'true') {
        await workspace.click();
    }
    const open = page.getByTestId('workspace-open').first();
    if (await open.isVisible().catch(() => false)) {
        await open.click();
    }
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
}

test('PDF открывается плагином рабочего места страницами', async ({ page }) => {
    await openPdf(page, 3);

    const frame = content(page);
    await expect(frame.locator('.page canvas').first()).toBeVisible();
    await expect(frame.locator('.page')).toHaveCount(3);
    await expect(page.getByTestId('reader-page')).toHaveText('1');
    await expect(page.getByTestId('reader-page-count')).toHaveText('из 3');
});

test('тема области чтения перекрашивает и фон плагина, и страницу', async ({ page }) => {
    await openPdf(page, 2);

    const pluginRoot = content(page).locator('html');
    const body = content(page).locator('body');
    const canvas = content(page).locator('.page canvas').first();
    await expect(pluginRoot).toHaveAttribute('data-reader-theme', 'light');
    const lightBackground = await body.evaluate((element) => getComputedStyle(element).backgroundColor);
    const lightPaper = await paperColor(canvas);

    await page.getByLabel('Тёмная тема области чтения').click();

    await expect(pluginRoot).toHaveAttribute('data-reader-theme', 'dark');
    await expect
        .poll(async () => body.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(lightBackground);
    // Интерфейсная тема независима.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // Страница перекрашена: бумага стала тёмной, но не почти чёрной и с оттенком
    // (у Gruvbox каналы не равны — тёплый фон темы).
    await expect.poll(async () => (await paperColor(canvas)) !== null).toBe(true);
    const paper = await paperColor(canvas);
    expect(paper).not.toBeNull();
    const luminance = 0.299 * paper!.r + 0.587 * paper!.g + 0.114 * paper!.b;
    // Бумага заметно темнее нейтрального чёрного (≈24) и теплее — с оттенком.
    expect(luminance).toBeLessThan(140);
    expect(luminance).toBeGreaterThan(38);
    expect(new Set([paper!.r, paper!.g, paper!.b]).size).toBeGreaterThan(1);
    // Выделение текста берёт синеватый цвет из темы области чтения, на тёмной
    // стороне — отдельный, чтобы было различимо.
    const darkSelection = await pluginRoot.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--reader-selection').trim(),
    );
    expect(darkSelection).not.toBe('');
    expect(darkSelection).not.toBe('rgba(96, 140, 180, 0.35)');
});

/** Преобладающий цвет (мода) пикселей канваса — «бумага» страницы. */
async function paperColor(
    canvas: import('@playwright/test').Locator,
): Promise<{ r: number; g: number; b: number } | null> {
    return canvas.evaluate((element) => {
        const target = element as HTMLCanvasElement;
        const context = target.getContext('2d');
        if (!context || !target.width || !target.height) {
            return null;
        }
        const { data } = context.getImageData(0, 0, target.width, target.height);
        const counts = new Map<string, number>();
        for (let offset = 0; offset < data.length; offset += 4 * 211) {
            const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        let best = '';
        let bestCount = 0;
        for (const [key, count] of counts) {
            if (count > bestCount) {
                best = key;
                bestCount = count;
            }
        }
        const [r, g, b] = best.split(',').map(Number);
        return { r, g, b };
    });
}

test('листание по страницам обновляет номер и прогресс', async ({ page }) => {
    await openPdf(page, 4);

    await expect(page.getByTestId('reader-page')).toHaveText('1');
    await page.getByRole('button', { name: 'Следующая страница' }).click();
    await expect(page.getByTestId('reader-page')).toHaveText('2');
    await expect(content(page).locator('.page canvas').nth(1)).toBeVisible();

    await page.getByRole('button', { name: 'Предыдущая страница' }).click();
    await expect(page.getByTestId('reader-page')).toHaveText('1');
});

test('прокрутка переводит текущую страницу', async ({ page }) => {
    await openPdf(page, 6);

    await content(page)
        .locator('#viewer')
        .evaluate((element) => {
            element.scrollTop = element.scrollHeight;
        });

    await expect
        .poll(async () => await page.getByTestId('reader-page').textContent(), { timeout: 15000 })
        .toBe('6');
});

test('переход к номеру страницы', async ({ page }) => {
    await openPdf(page, 4);

    await page.getByLabel('Перейти к странице').fill('3');
    await page.getByLabel('Перейти к странице').press('Enter');

    await expect
        .poll(async () => await page.getByTestId('reader-page').textContent(), { timeout: 15000 })
        .toBe('3');
    await expect
        .poll(
            async () =>
                content(page)
                    .locator('.page')
                    .nth(2)
                    .evaluate((element) => element.getBoundingClientRect().top),
            { timeout: 15000 },
        )
        .toBeLessThan(120);
});

test('страница восстанавливается после перезагрузки', async ({ page }) => {
    await openPdf(page, 4);

    await page.getByRole('button', { name: 'Следующая страница' }).click();
    await page.getByRole('button', { name: 'Следующая страница' }).click();
    await expect(page.getByTestId('reader-page')).toHaveText('3');

    await expect
        .poll(async () => {
            const raw = await page.evaluate(() => window.localStorage.getItem('workspaces'));
            const registry = raw ? JSON.parse(raw) : null;
            const position = registry?.workspaces?.[0]?.tabs?.[0]?.position ?? 0;
            return typeof position === 'number' ? position : 0;
        })
        .toBeGreaterThan(50);

    await page.reload();
    await reopenWorkplace(page);
    await expect(page.getByTestId('reader-page')).toHaveText('3');
});

test('масштаб меняет размер страницы, не меняя номер', async ({ page }) => {
    await openPdf(page, 3);

    await page.getByRole('button', { name: 'Следующая страница' }).click();
    await expect(page.getByTestId('reader-page')).toHaveText('2');

    const pageEl = content(page).locator('.page').nth(1);
    const before = await pageEl.evaluate((element) => element.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
    await expect
        .poll(async () => pageEl.evaluate((element) => element.getBoundingClientRect().width))
        .toBeGreaterThan(before);
    await expect(page.getByTestId('reader-page')).toHaveText('2');
});

/** Выделение первого фрагмента текстового слоя указанной страницы. */
async function selectTextOnPage(page: Page, pageNumber: number) {
    await content(page)
        .locator('.page')
        .nth(pageNumber - 1)
        .locator('.textLayer')
        .evaluate((layer) => {
            const span = layer.querySelector('span');
            if (!span || !span.firstChild) {
                return;
            }
            const document = layer.ownerDocument;
            const range = document.createRange();
            range.selectNodeContents(span);
            const selection = document.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });
    await expect(page.getByTestId('quote-menu')).toBeVisible();
    await page.getByTestId('quote-menu').getByTestId('note-color-yellow').click();
}

test('сильное увеличение не оставляет страницу белой', async ({ page }) => {
    await openPdf(page, 2);

    // Приближаем до максимального масштаба: страница в пикселях становится
    // огромной, и без ограничения канвас превысил бы допустимый размер.
    for (let index = 0; index < 60; index += 1) {
        await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
    }

    const pageEl = content(page).locator('.page').first();
    await expect
        .poll(async () =>
            pageEl.evaluate((element) => {
                const canvas = element.querySelector('canvas');
                if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) {
                    return false;
                }
                // Канвас не пустой: в центре есть непустой пиксель.
                const context = canvas.getContext('2d');
                if (!context) {
                    return false;
                }
                const data = context.getImageData(
                    Math.floor(canvas.width / 2),
                    Math.floor(canvas.height / 2),
                    1,
                    1,
                ).data;
                return data[3] !== 0;
            }),
        )
        .toBe(true);
});

// Прокрутка не должна гасить текст. На обычных масштабах (например, 200 %)
// страница должна рисоваться целиком: тогда прокрутка внутри неё ничего не
// перерисовывает. Если же рисовать окном видимой области, видимая область
// уходит за пределы окна, страница освобождается и белеет до конца отрисовки —
// текст «пропадает» на всё время прокрутки.
test('прокрутка не оставляет белых полос на странице', async ({ page }) => {
    await openPdf(page, 1);
    await setZoom(page, 200);

    const blanks = await content(page)
        .locator('#viewer')
        .evaluate(async (viewer) => {
            const pagesHost = document.getElementById('pages');
            if (!pagesHost) {
                return [1];
            }
            const measure = () => {
                const viewerRect = viewer.getBoundingClientRect();
                const canvases = Array.from(document.querySelectorAll('.page canvas')).map((canvas) =>
                    canvas.getBoundingClientRect(),
                );
                let total = 0;
                let blank = 0;
                for (let y = viewerRect.top + 20; y < viewerRect.bottom - 20; y += 40) {
                    for (let x = viewerRect.left + 40; x < viewerRect.right - 40; x += 160) {
                        const pageEl = Array.from(pagesHost.children).find((candidate) => {
                            const rect = candidate.getBoundingClientRect();
                            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
                        });
                        if (!pageEl) {
                            continue;
                        }
                        total += 1;
                        const covered = canvases.some(
                            (canvas) =>
                                x >= canvas.left &&
                                x <= canvas.right &&
                                y >= canvas.top &&
                                y <= canvas.bottom,
                        );
                        if (!covered) {
                            blank += 1;
                        }
                    }
                }
                return total > 0 ? blank / total : 1;
            };
            const start = viewer.scrollTop;
            const samples: number[] = [measure()];
            // Непрерывная прокрутка небольшими шагами без пауз: проверяется,
            // что текст остаётся видимым прямо во время движения.
            for (let step = 1; step <= 20; step += 1) {
                viewer.scrollTop = start + step * 50;
                await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
                samples.push(measure());
            }
            return samples;
        });

    expect(Math.max(...blanks)).toBeLessThan(0.02);
});

// Проверка при плотности HiDPI: без учёта плотности содержимое рисуется вдвое
// мельче текстового слоя, и на экране текст мутный и не совпадает со строками.
test.describe('плотность экрана 2', () => {
    test.use({ deviceScaleFactor: 2 });

    test('нарисованный текст совпадает с текстовым слоем по масштабу', async ({ page }) => {
        await openPdf(page, 1);

        // Нарисованное содержимое должно стоять ровно там же, где текстовый слой:
        // если страница отрисована без учёта окна и плотности, текст уезжает и
        // масштабируется неверно — резкость и попадание по строкам ломаются.
        const result = await content(page)
            .locator('.page')
            .first()
            .evaluate((element) => {
                const canvas = element.querySelector('canvas');
                const textLayer = element.querySelector('.textLayer');
                const span = textLayer?.querySelector('span');
                if (!(canvas instanceof HTMLCanvasElement) || !span) {
                    return null;
                }
                const pageRect = element.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();
                const spanRect = span.getBoundingClientRect();
                const context = canvas.getContext('2d');
                if (!context) {
                    return null;
                }
                const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let minX = canvas.width;
                let minY = canvas.height;
                let maxX = -1;
                let maxY = -1;
                for (let y = 0; y < canvas.height; y += 1) {
                    for (let x = 0; x < canvas.width; x += 1) {
                        const offset = (y * canvas.width + x) * 4;
                        const luminance =
                            (image[offset] + image[offset + 1] + image[offset + 2]) / 3;
                        if (image[offset + 3] > 0 && luminance < 128) {
                            if (x < minX) {
                                minX = x;
                            }
                            if (y < minY) {
                                minY = y;
                            }
                            if (x > maxX) {
                                maxX = x;
                            }
                            if (y > maxY) {
                                maxY = y;
                            }
                        }
                    }
                }
                if (maxX < 0 || maxY < 0) {
                    return null;
                }
                const scaleX = canvasRect.width / canvas.width;
                const scaleY = canvasRect.height / canvas.height;
                return {
                    canvas: {
                        left: canvasRect.left - pageRect.left + minX * scaleX,
                        top: canvasRect.top - pageRect.top + minY * scaleY,
                        width: (maxX - minX) * scaleX,
                        height: (maxY - minY) * scaleY,
                    },
                    span: {
                        left: spanRect.left - pageRect.left,
                        top: spanRect.top - pageRect.top,
                        width: spanRect.width,
                        height: spanRect.height,
                    },
                };
            });

        expect(result).not.toBeNull();
        if (!result) {
            return;
        }

        // Положение и размер нарисованного текста близки к текстовому слою.
        expect(Math.abs(result.canvas.left - result.span.left)).toBeLessThan(20);
        expect(Math.abs(result.canvas.top - result.span.top)).toBeLessThan(20);
        expect(result.canvas.height).toBeGreaterThan(result.span.height * 0.6);
        expect(result.canvas.height).toBeLessThan(result.span.height * 1.4);
    });
});

// Дробный масштаб даёт дробный размер страницы: 80 % → 652.8 px, 110 % → 897.6 px.
// Если канвас унаследует дробный размер или позицию, браузер пересэмплирует растр
// и текст мутнеет. Канвас привязывается к пиксельной сетке устройства, поэтому
// его размер и положение в физических пикселях целые на любом масштабе.
test.describe('резкость на дробных масштабах', () => {
    for (const zoom of [80, 110, 140, 170]) {
        test(`канвас выровнен по пиксельной сетке при ${zoom}%`, async ({ page }) => {
            await openPdf(page, 1);
            await setZoom(page, zoom);
            await expect
                .poll(async () => await alignmentError(page), { timeout: 15000 })
                .toBeLessThan(0.05);
            expect(await alignmentError(page)).toBeLessThan(0.05);
        });
    }
});

test.describe('резкость на дробных масштабах (HiDPI 1.25)', () => {
    test.use({ deviceScaleFactor: 1.25 });

    for (const zoom of [80, 110, 140, 170]) {
        test(`канвас выровнен по пиксельной сетке при ${zoom}%`, async ({ page }) => {
            await openPdf(page, 1);
            await setZoom(page, zoom);
            await expect
                .poll(async () => await alignmentError(page), { timeout: 15000 })
                .toBeLessThan(0.05);
            expect(await alignmentError(page)).toBeLessThan(0.05);
        });
    }
});

test('выделение текста создаёт заметку-цитату с подсветкой на странице', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();

    await selectTextOnPage(page, 1);

    await expect(page.getByTestId('notes-item-link')).toContainText('Page 1');
    await expect(content(page).locator('.note')).toHaveCount(1);

    // Подсветка ложится умножением: текст остаётся контрастным, а не выбеливается.
    const blend = await content(page)
        .locator('.note')
        .first()
        .evaluate((element) => getComputedStyle(element).mixBlendMode);
    expect(blend).toBe('multiply');
});

test('полосы подсветки соседних строк не накладываются друг на друга', async ({ page }) => {
    await openPdf(page, 3, true);
    await page.getByRole('button', { name: 'Заметки' }).click();

    // Выделяем обе строки страницы: у текстового слоя высота строки включает
    // межстрочный интервал, и без среза наложения полупрозрачная подсветка в
    // местах стыка темнела.
    await content(page)
        .locator('.page')
        .first()
        .locator('.textLayer')
        .evaluate((layer) => {
            const spans = Array.from(layer.querySelectorAll('span')).filter(
                (span) => span.firstChild,
            );
            if (spans.length < 2) {
                return;
            }
            const document = layer.ownerDocument;
            const range = document.createRange();
            range.setStartBefore(spans[0]);
            range.setEndAfter(spans[spans.length - 1]);
            const selection = document.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            spans[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });
    await expect(page.getByTestId('quote-menu')).toBeVisible();
    await page.getByTestId('quote-menu').getByTestId('note-color-yellow').click();

    const boxes = await content(page)
        .locator('.note')
        .evaluateAll((elements) =>
            elements
                .map((element) => element.getBoundingClientRect())
                .sort((a, b) => a.top - b.top)
                .map((rect) => ({ top: rect.top, bottom: rect.bottom })),
        );
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < boxes.length; index += 1) {
        // Полоса следующей строки начинается на уровне низа предыдущей, а не выше.
        expect(boxes[index].top).toBeGreaterThanOrEqual(boxes[index - 1].bottom - 1);
    }

    // Исходные прямоугольники текстового слоя действительно перекрывались:
    // иначе проверка выше ничего не доказывала бы.
    const rawOverlap = await content(page)
        .locator('.page')
        .first()
        .evaluate(() => {
            const spans = Array.from(
                document.querySelectorAll('.page .textLayer span'),
            ).filter((span) => span.firstChild);
            const rects = spans.map((span) => span.getBoundingClientRect());
            let overlap = 0;
            for (let index = 1; index < rects.length; index += 1) {
                overlap = Math.max(
                    overlap,
                    rects[index - 1].bottom - rects[index].top,
                );
            }
            return overlap;
        });
    expect(rawOverlap).toBeGreaterThan(0);
});

// Выделение текста рисует собственный слой, а не браузер: браузерные
// прямоугольники строк перекрываются и мутят растр. Полосы слоя слиты и
// обрезаны по стыкам, а заливка ложится на страницу умножением (осветлением в
// тёмной теме), как подсветка цитаты.
test('выделение текста ложится ровными полосами, не перекрываясь', async ({ page }) => {
    await openPdf(page, 3, true);

    await content(page)
        .locator('.page')
        .first()
        .locator('.textLayer')
        .evaluate((layer) => {
            const spans = Array.from(layer.querySelectorAll('span')).filter(
                (span) => span.firstChild,
            );
            if (spans.length < 2) {
                return;
            }
            const document = layer.ownerDocument;
            const range = document.createRange();
            range.setStartBefore(spans[0]);
            range.setEndAfter(spans[spans.length - 1]);
            const selection = document.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            spans[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });

    await expect(content(page).locator('.selection-layer')).toHaveCount(1);
    const bands = await content(page)
        .locator('.selection-band')
        .evaluateAll((elements) =>
            elements
                .map((element) => element.getBoundingClientRect())
                .sort((a, b) => a.top - b.top)
                .map((rect) => ({ top: rect.top, bottom: rect.bottom })),
        );
    expect(bands.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < bands.length; index += 1) {
        // Полоса следующей строки начинается на уровне низа предыдущей, а не выше.
        expect(bands[index].top).toBeGreaterThanOrEqual(bands[index - 1].bottom - 1);
    }
    // Нативное выделение прозрачно: подсветку рисует только слой.
    const native = await content(page)
        .locator('.textLayer')
        .first()
        .evaluate((layer) => {
            const span = Array.from(layer.querySelectorAll('span')).find(
                (candidate) => candidate.firstChild,
            );
            return span ? getComputedStyle(span, '::selection').backgroundColor : '';
        });
    expect(native).toBe('rgba(0, 0, 0, 0)');
    // Заливка ложится на страницу умножением, а не поверх текста.
    const blend = await content(page)
        .locator('.selection-layer')
        .evaluate((element) => getComputedStyle(element).mixBlendMode);
    expect(blend).toBe('multiply');
});

test('меню заметки закрывается при снятии выделения', async ({ page }) => {
    await openPdf(page, 3);

    await content(page)
        .locator('.page')
        .first()
        .locator('.textLayer')
        .evaluate((layer) => {
            const span = layer.querySelector('span');
            if (!span || !span.firstChild) {
                return;
            }
            const document = layer.ownerDocument;
            const range = document.createRange();
            range.selectNodeContents(span);
            const selection = document.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });
    await expect(page.getByTestId('quote-menu')).toBeVisible();

    await content(page)
        .locator('#viewer')
        .evaluate((element) => {
            element.ownerDocument.getSelection()?.removeAllRanges();
        });

    await expect(page.getByTestId('quote-menu')).toHaveCount(0);
});

test('заметка на странице восстанавливается после перезагрузки', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();
    await selectTextOnPage(page, 1);
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    await expect
        .poll(async () => {
            const raw = await page.evaluate(() => window.localStorage.getItem('workspaces'));
            const registry = raw ? JSON.parse(raw) : null;
            return registry?.workspaces?.[0]?.tabs?.length ?? 0;
        })
        .toBe(1);

    await page.reload();
    await reopenWorkplace(page);
    await page.getByRole('button', { name: 'Заметки' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(content(page).locator('.note')).toHaveCount(1);
});

test('клик по заметке ведёт к странице заметки', async ({ page }) => {
    await openPdf(page, 4);
    await page.getByRole('button', { name: 'Заметки' }).click();
    await page.getByLabel('Перейти к странице').fill('3');
    await page.getByLabel('Перейти к странице').press('Enter');
    await expect
        .poll(async () => await page.getByTestId('reader-page').textContent(), { timeout: 15000 })
        .toBe('3');
    await selectTextOnPage(page, 3);
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    await page.getByTestId('notes-item-link').click();

    await expect
        .poll(
            async () =>
                content(page)
                    .locator('.page')
                    .nth(2)
                    .evaluate((element) => element.getBoundingClientRect().top),
            { timeout: 15000 },
        )
        .toBeLessThan(120);
    await expect(content(page).locator('.note')).toHaveCount(1);
});

test('клик по подсветке открывает панель заметок и выбирает заметку', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();
    await selectTextOnPage(page, 1);
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    await page.getByRole('button', { name: 'Заметки' }).click();
    await expect(page.getByTestId('notes-panel')).toHaveCount(0);

    await content(page).locator('.note').first().click();

    await expect(page.getByTestId('notes-panel')).toBeVisible();
    await expect(page.getByTestId('notes-item')).toHaveAttribute('data-selected', 'true');
});

/** Выбор инструмента заметок в панели инструментов рабочего места. */
async function selectTool(page: Page, name: string) {
    await page.getByTestId('note-toolbar').getByRole('button', { name }).click();
}

test('текстовая карточка создаётся кликом по странице', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();

    // Страничный формат сохраняет все три типа: текст и фигура доступны.
    const toolbar = page.getByTestId('note-toolbar');
    await expect(toolbar.getByRole('button', { name: 'Цитата' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Текст' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Фигура' })).toBeVisible();

    await selectTool(page, 'Текст');
    await content(page).locator('.page').first().click({ position: { x: 120, y: 120 } });

    const editor = page.getByTestId('text-card-editor');
    await expect(editor).toBeVisible();
    await editor.getByLabel('Текст заметки').fill('Мысль о странице');
    await editor.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(page.getByTestId('notes-item-type')).toHaveText('Текст');
    await expect(content(page).locator('.note-card').first()).toHaveText('Мысль о странице');

    // Название и комментарий доступны заметке любого типа и правятся в панели.
    await page.getByLabel('Действия с заметкой').first().click();
    await page.getByRole('menuitem', { name: 'Изменить' }).click();
    await page.getByLabel('Название заметки').fill('Мысль');
    await page.getByLabel('Комментарий заметки').fill('Вернуться к ней');
    await page.getByTestId('notes-item-editor').getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByTestId('notes-item-link')).toContainText('Мысль');
    await expect(page.getByTestId('notes-item-comment')).toHaveText('Вернуться к ней');
});

test('фигура рисуется протяжкой по странице', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();

    await selectTool(page, 'Фигура');
    const pageEl = content(page).locator('.page').first();
    await pageEl.dragTo(pageEl, {
        sourcePosition: { x: 80, y: 80 },
        targetPosition: { x: 220, y: 180 },
    });

    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(page.getByTestId('notes-item-type')).toHaveText('Фигура');
    await expect(content(page).locator('.note-shape line')).toHaveCount(1);

    // Фигура, как и подсветка, ложится умножением (на слое фигуры): текст под ней не выбеливается.
    const blend = await content(page)
        .locator('.note-shape')
        .first()
        .evaluate((element) => getComputedStyle(element).mixBlendMode);
    expect(blend).toBe('multiply');
});

test('фигура-эллипс рисуется и переживает смену масштаба', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();

    await selectTool(page, 'Фигура');
    await page.getByRole('button', { name: 'Вид фигуры' }).click();
    await page.getByRole('option', { name: 'Эллипс' }).click();

    const pageEl = content(page).locator('.page').first();
    await pageEl.dragTo(pageEl, {
        sourcePosition: { x: 80, y: 80 },
        targetPosition: { x: 220, y: 180 },
    });
    await expect(content(page).locator('.note-shape ellipse')).toHaveCount(1);

    const ellipse = content(page).locator('.note-shape ellipse');
    // Эллипс — полупрозрачная заливка цветом заметки, без обводки (как цитата).
    await expect(ellipse).toHaveAttribute('fill', /^#|rgb/);
    await expect(ellipse).toHaveAttribute('stroke', 'none');
    const fillOpacity = await ellipse.evaluate((element) => getComputedStyle(element).fillOpacity);
    expect(Number(fillOpacity)).toBeLessThan(1);

    const before = await content(page)
        .locator('.note-shape')
        .first()
        .evaluate((element) => element.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
    await expect
        .poll(async () =>
            content(page)
                .locator('.note-shape')
                .first()
                .evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBeGreaterThan(before);
    await expect(content(page).locator('.note-shape ellipse')).toHaveCount(1);
});

test('текстовую карточку в PDF можно переместить через контекстное меню', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();

    await selectTool(page, 'Текст');
    await content(page).locator('.page').first().click({ position: { x: 120, y: 120 } });
    const editor = page.getByTestId('text-card-editor');
    await editor.getByLabel('Текст заметки').fill('Сдвинь меня');
    await editor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    const card = content(page).locator('.note-card').first();
    await card.click();
    // Клик по карточке (инструмент «текст» активен) не открывает редактор.
    await expect(page.getByTestId('note-menu')).toBeVisible();
    await expect(page.getByTestId('text-card-editor')).toHaveCount(0);
    await page.getByTestId('note-menu').getByRole('button', { name: 'Переместить' }).click();
    const guide = content(page).locator('.note-move-guide');
    await expect(guide).toBeVisible();
    // Рамка направляющих совпадает с карточкой, включая её рамку: у направляющих
    // не должно быть content-box, иначе рамка добавляет заметку справа и снизу.
    const cardBox = await card.boundingBox();
    const guideBox = await guide.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(guideBox).not.toBeNull();
    expect(Math.abs(guideBox!.width - cardBox!.width)).toBeLessThan(2);
    expect(Math.abs(guideBox!.height - cardBox!.height)).toBeLessThan(2);

    const before = await card.evaluate((element) => element.style.left);
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 5, box!.y + 5);
    await page.mouse.down();
    await page.mouse.move(box!.x + 80, box!.y + 60, { steps: 8 });
    await page.mouse.up();

    await expect
        .poll(async () => card.evaluate((element) => element.style.left))
        .not.toBe(before);
});

test('перемещение в PDF работает и под инструментом фигуры', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();

    await selectTool(page, 'Текст');
    await content(page).locator('.page').first().click({ position: { x: 120, y: 120 } });
    const editor = page.getByTestId('text-card-editor');
    await editor.getByLabel('Текст заметки').fill('Сдвинь');
    await editor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    // Инструмент фигуры активен: клик по карточке переключает его на «текст»,
    // поэтому реальное нажатие «Переместить» не перехватывается протяжкой.
    await selectTool(page, 'Фигура');
    const card = content(page).locator('.note-card').first();
    await card.click();
    await expect(page.getByTestId('note-toolbar').getByRole('button', { name: 'Текст' })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(page.getByTestId('note-menu')).toBeVisible();
    await expect(page.getByTestId('text-card-editor')).toHaveCount(0);

    await page.getByTestId('note-menu').getByRole('button', { name: 'Переместить' }).click();
    await expect(content(page).locator('.note-move-guide')).toBeVisible();

    const before = await card.evaluate((element) => element.style.left);
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 5, box!.y + 5);
    await page.mouse.down();
    await page.mouse.move(box!.x + 70, box!.y + 50, { steps: 8 });
    await page.mouse.up();

    await expect
        .poll(async () => card.evaluate((element) => element.style.left))
        .not.toBe(before);
});

test('фигуру в PDF можно выбрать кликом по контуру', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();

    await selectTool(page, 'Фигура');
    const pageEl = content(page).locator('.page').first();
    await pageEl.dragTo(pageEl, {
        sourcePosition: { x: 80, y: 80 },
        targetPosition: { x: 240, y: 160 },
    });
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    // Клик по прозрачной мишени контура открывает контекстное меню фигуры.
    // Клик идёт по координатам середины фигуры: наложение перерисовывается, и
    // проверка устойчивости Playwright на этом спотыкается.
    const box = await content(page).locator('.note-shape path').first().boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    const menu = page.getByTestId('note-menu');
    await expect(menu).toBeVisible();
    // Меню привязано к самой фигуре, а не к SVG-слою во всю страницу.
    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.y).toBeLessThan(box!.y + box!.height + 80);
    expect(menuBox!.y).toBeGreaterThan(box!.y);
    await menu.getByRole('button', { name: 'Переместить' }).click();
    await expect(content(page).locator('body')).toHaveAttribute('data-editing', 'move');
});

test('границы цитаты в PDF правятся маркерами по тексту', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByRole('button', { name: 'Заметки' }).click();
    await selectTextOnPage(page, 1);

    await content(page).locator('.overlay .note').first().click();
    await expect(page.getByTestId('note-menu')).toBeVisible();
    await page
        .getByTestId('note-menu')
        .getByRole('button', { name: 'Изменить выделение' })
        .click();
    await expect(content(page).locator('.note-handle')).toHaveCount(2);
});

