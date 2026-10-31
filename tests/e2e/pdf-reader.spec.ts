import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBookToWorkspace, openWorkspaceArea } from './workplace-area';

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
        resolve(ROOT, 'src-tauri', 'resources', 'plugins', 'format-pdf', 'viewer', 'index.html'),
        'utf8',
    );
}

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

/** Файлы модуля рисования плагина PDF из развёрнутого каталога.
 *
 * Состав берётся из ресурса, который реально грузит приложение: ядро перечисляет
 * каталог модуля целиком, поэтому фикстура тоже читает каталог, а добавление
 * файла (например, собранного `viewer.js`) не требует правок теста.
 */
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

/** PDF из одной страницы заданного размера (в пунктах) с текстом у левого края. */
function pdfBase64Sized(width: number, height: number): string {
    const objects: string[] = [];
    const stream = `BT /F1 36 Tf 36 ${height - 92} Td (Wide page sample text) Tj ET`;
    objects.push('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj');
    objects.push('2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj');
    objects.push(
        `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${width} ${height}]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
    );
    objects.push(`4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj`);
    objects.push('5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj');
    const raw = `%PDF-1.4\n${objects.join('\n')}\ntrailer<</Root 1 0 R>>\n%%EOF`;
    return Buffer.from(raw, 'binary').toString('base64');
}

/** PDF-«скан»: изображение с полосами-«буквами» и невидимый (`rendering mode
 *  3`) текстовый слой, спозиционированный короче растра.
 *
 * Воспроизводит файлы из обращения: видимый текст — растр, а невидимый слой не
 * доходит до правого края строки. «Буквы» растра — полосы без промежутков в
 * размер пробела, поэтому правый край строки однозначен, а невидимый текст
 * явно короче него (сжимается `Tz`).
 */
function pdfScanBase64(): string {
    const width = 128;
    const height = 32;
    const image = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const value = x % 8 < 4 ? 0 : 255;
            const offset = (y * width + x) * 3;
            image[offset] = value;
            image[offset + 1] = value;
            image[offset + 2] = value;
        }
    }
    const content =
        'q 128 0 0 32 30 80 cm /Im1 Do Q BT 3 Tr /F1 34 Tf 90 Tz 44 92 Td (Sample) Tj ET';
    const objects = [
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>/XObject<</Im1 6 0 R>>>>>>endobj',
        `4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj`,
        '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
        `6 0 obj<</Type/XObject/Subtype/Image/Width ${width}/Height ${height}/ColorSpace/DeviceRGB/BitsPerComponent 8/Length ${image.length}>>stream\n`,
    ];
    const head = Buffer.from(`%PDF-1.4\n${objects.join('\n')}`, 'binary');
    const tail = Buffer.from('\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'binary');
    return Buffer.concat([head, image, tail]).toString('base64');
}

/** Встроенный в фикстуру TrueType-шрифт (subset Liberation Sans).
 *
 * Метрики глифов намеренно неравномерны: встроенный шрифт заведомо расходится с
 * запасным, которым pdf.js раскладывает невидимый слой. Так в любом движке
 * (включая Chromium браузерных тестов) видно, что слой строится встроенным
 * шрифтом страницы, а не подстановкой. Данные получены `fontTools` из
 * `node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf`; контуры
 * сохранены, чтобы браузер загрузил шрифт.
 */
const PDF_EMBEDDED_FONT_BASE64 = [
    'AAEAAAAHAEAAAgAwY21hcAF1AlAAAAEwAAAAZGdseWYahU8QAAABtAAABeJoZWFkDAfsrQAAAHwAAAA2aGhlYQrKByAAAAC0',
    'AAAAJGhtdHgrdwAAAAAA+AAAADhsb2NhC88KUQAAAZQAAAAebWF4cABrAeEAAADYAAAAIAABAAAAARHr/sYMGl8PPPUAHwgA',
    'AAAAAL8a/4AAAAAA5vKS6P5g/10IZwQAAAAACAACAAAAAAAAAAEAAAQA/10AAAjA/mD+9AhnAAEAAAAAAAAAAAAAAAAAAAAO',
    'AAEAAAAOAVIAVACMAAUAAQAAAAAAAAAAAAAAAAADAAIB4AAAAmkAAALyAAADewAABAQAAAIhAAACqgAAAzMAAAO8AAAERQAA',
    'AmIAAALrAAADdAAAA/0AAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAUAAAABAAEAADAAAAYQBlAGcAaQBuAHUAef//AAAAYQBk',
    'AGcAaQBsAHIAef///6D/nv+d/5z/mv+X/5QAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAFsApwDhAUEBVAFgAbEB5wIWAmQChwK+',
    'AvEAAAACAFf/7ARzBE4AMgBBAAAFIiY1ND4CPwE1NC4CIyIOAgcnPgMzMhYVERQWMzI2NxUOASMiLgInIw4DJzI+Aj0BBw4D',
    'FRQWAZ6jpFGDqFfzHDpXOzRUPiYGvAo4Z5tuzM4qOw8eDiJDJjNJLhgDBh1FXHUjVoFVKsVCd1o1XxSslmuJTh4CBDtDXjob',
    'DydDMxFAa04ru7H+LlBRBANwCAgbN1E2NFQ7IIc/YnQ1WQQBETJaSVhgAAIAVv/sA+8FzAAfADMAACUOASMiAhEQITIWFzM0',
    'LgE0NREzERQeAhcjLgM1ARQeAjMyPgI1NC4CIyIOAgM1MqV6zcEBjnukMgIBAbQBAgIBrAIDAwL92hw+YEVHbUkmJkprRkJg',
    'QB+uaFoBFAEYAjZaYgorLyoJAaP7EydIPCsJCiUwNRoBcHCgZzAuZ6Z4c59iKy5mowAAAgBX/+wEGAROABwAJQAAARQeAjMy',
    'NjcXDgMjIgIRND4CMzIeAh0BJy4BIyIOAgcBFCNJclB1jRmeET1mmWzw+0yEsGSIt28vug+Qhy1jVDoEAfdVj2c5XkgtLVtJ',
    'LwEeARqY04Q7WJvSehiKq50dSn9iAAACAFb+VwPvBEsAMQBFAAABIi4CJzceATMyPgI9ASMOAyMiLgI1ND4CMzIWFzM0PgI3',
    'Mw4DFREUBhM0LgIjIg4CFRQeAjMyPgICJF2QZkAOtRJ7ZD1kRiYCFDtVcEhnk10rK2Gbb3OpLgIDAwQCqwECAgHfLDFQZzZF',
    'Y0EfH0BiRDZnUjL+VyZHYjwaS1EiS3hWrilLOiNFis2HgtCRTWlhGT43KAMJKzxJJ/zF4+UDxnGhZjAwZ6FwdZ9iKi5kngAC',
    'AIkAAAE9BcwAAwAHAAATNTMVAxEzEYm0tLQFIKys+uAEOvvGAAEAigAAAT4FzAADAAAzETMRirQFzPo0AAEAiAAABiMETgA7',
    'AAAhETQuAiMiDgIVESMRNC4CJzMeAxUzPgMzMhYXMz4DMzIeAhURIxE0LgIjIg4CFREDABQvTDc5XEEjswECAgGqAQIDAgMY',
    'OEthQHuPHAMYPFBkQFJ3TCSyFC9MNzlcQSMCrk9qQRstVX1R/Y0DUyJLQzAHBSw5OxQvTDUdYmsvTDUdLFyRZP0vAq5PakEb',
    'K1R+U/2NAAEAiAAAA+4ETgAlAAAhETQuAiMiDgIVESMRNC4CJzMeAxUzPgMzMh4CFREDORc0VT9AZ0kotAECAgGqAQIDAgMa',
    'PlJqRlqCVCcCrk9qQRstVX1R/Y0DUyJLQzAHBSw5OxQvTDUdLFyRZP0vAAEAiAAAAogETgAfAAAzETQuAiczHgMVMz4DMzIW',
    'FxUuASMiDgIVEY4BAgIBqgEDAwEEEys6UDkWKAsSMB4+VzcaAz4iR0I6Fxc7PjkUPls7HQcDpQUFOGOJUf3MAAABADn/7AO2',
    'BEsANwAAARQOAiMiLgInNx4BMzI+AjU0LgInLgM1NDYzMhYXBy4DIyIGFRQeAhceBQO2O3CjaV6Xck0SnxeQgDphRicuUnVG',
    'QYBnQNPKs9McogkwRFUuenQrTWxBK1pVSzghAStMd1ErHUBpTB9XURAnQTAxPyofExEqRWZNlJt+ixQqOSMPSkssOScdEAsZ',
    'Iy9CWAABAB//8AIqBSwAFgAAJQ4BIyI1ESM1MzczFTMVIxEUFjMyNjcCKilVONh9hDV4yMgzPxoxHQgLDfUC0oPy8oP9VU4/',
    'CAYAAQCF/+wD6wQ6ACUAAAERFB4CMzI+AjURMxEUHgIXIy4DNSMOAyMiLgI1EQE6FzRVP0BnSSi0AQICAaoBAgMCAxo+UmpG',
    'WoJUJwQ6/VJPakEbLVV9UQJz/K0iS0MwBwUsOTsUL0w1HSxckGUC0QABAAX+VwP8BDoAHwAAIQ4DIyImJzUeATMyNj8BATMT',
    'HgMXPgM3EzMCXCZPYnhOIjogEzART4gzEf5TwOQKHx8YAgMXHR4K1L5inW87BAeHAwN2gSsENf2qG1paSAkLQVBSHgJqAAAA',
].join('');

/** PDF-«цифровая страница» со встроенным шрифтом.
 *
 * Две строки `misunderstandingly` набраны встроенным (не подстановочным)
 * TrueType-шрифтом с неравномерными метриками, метрики его вертикали занижены
 * (`hhea` в шрифте: ascender 0.5 кегля, descender 0.08 кегля). Слово
 * `understandingly` начинается с индекса 3; границы слова в пунктах вычисляются
 * из массива ширин `/Widths` (в единицах 1/1000 кегля, кегль 24 pt, начало
 * строки `x = 60`). Межстрочный шаг — 24 pt: он **меньше** высоты строки
 * запасного семейства (`serif`/`sans-serif`), поэтому полосы выделения и
 * цитаты соседних строк перекрываются, только если встроенному шрифту возвращены
 * вертикальные метрики запасного (см. `applyFallbackMetrics` во вьюере).
 */
function pdfEmbeddedFontBase64(): string {
    const font = Buffer.from(PDF_EMBEDDED_FONT_BASE64, 'base64');
    // Ширины глифов символов 97…121 (a…z) в единицах 1/1000 кегля.
    const widths = [
        301, 0, 0, 368, 435, 0, 502, 0, 266, 0, 0, 333, 400, 467, 0, 0, 0, 534, 298, 365, 432, 0, 0,
        0, 499,
    ];
    const content =
        'BT /F1 24 Tf 60 700 Td (misunderstandingly) Tj 0 -24 Td (misunderstandingly) Tj ET';
    const objects = [
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
        `4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj`,
        `5 0 obj<</Type/Font/Subtype/TrueType/BaseFont/AAAAAA+Mini/FirstChar 97/LastChar 121/Widths[${widths.join(' ')}]/FontDescriptor 6 0 R/Encoding/WinAnsiEncoding>>endobj`,
        `6 0 obj<</Type/FontDescriptor/FontName/AAAAAA+Mini/Flags 32/FontBBox[0 0 1000 1000]/ItalicAngle 0/Ascent 500/Descent -80/CapHeight 500/StemV 80/FontFile2 7 0 R>>endobj`,
        `7 0 obj<</Length ${font.length}/Length1 ${font.length}>>stream\n`,
    ];
    const head = Buffer.from(`%PDF-1.4\n${objects.join('\n')}`, 'binary');
    const tail = Buffer.from('\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'binary');
    return Buffer.concat([head, font, tail]).toString('base64');
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
async function installPdfMock(page: Page, pageCount: number, twoLines = false, data?: string) {
    const files = viewerFiles();
    const entry = viewerEntry();
    await page.addInitScript(
        (payload: { data: string; books: unknown; entry: string; files: unknown }) => {
            (
                window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }
            ).__TEXTURE_MOCK_OVERRIDES__ = {
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
                        // Как и ядро, порция выравнивается по трём байтам: тогда
                        // её base64 без паддинга и содержимое собирается склейкой.
                        const requested = Math.min(request.length ?? 5, 5);
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
        {
            data: data ?? (twoLines ? pdfBase64TwoLines(pageCount) : pdfBase64(pageCount)),
            books: PDF_BOOKS,
            entry,
            files,
        },
    );
}

/** Открытие PDF вкладкой рабочего места. */
async function openPdf(page: Page, pageCount: number, twoLines = false, data?: string) {
    await installPdfMock(page, pageCount, twoLines, data);
    await page.goto('/');
    await addBookToWorkspace(page, /Демо-книга/);
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
    // Готовность области содержимого: страницы построены, первая отрисована.
    await content(page).locator('.page canvas').first().waitFor({ timeout: 20000 });
}

/** Область содержимого плагина. */
function content(page: Page) {
    return page.frameLocator('iframe[title="Содержимое книги"]');
}

/** Приведение области чтения к заданному уровню шкалы масштаба.
 *
 * Шаг кнопок — не фиксированные 10 %: панель идёт по общей лестнице уровней, где
 * на краях диапазона шаг крупнее. Хелпер читает фактический масштаб и жмёт кнопку
 * в нужную сторону, пока не достигнет цели.
 */
async function setZoom(page: Page, target: number) {
    const readZoom = async () =>
        Number(((await page.getByTestId('reader-zoom').textContent()) ?? '100').replace('%', ''));
    const bigger = page.getByRole('button', { name: 'Увеличить масштаб' });
    const smaller = page.getByRole('button', { name: 'Уменьшить масштаб' });
    let current = await readZoom();
    while (current !== target) {
        const before = current;
        if (current < target) {
            await bigger.click();
        } else {
            await smaller.click();
        }
        await expect
            .poll(readZoom)
            .not.toBe(before);
        current = await readZoom();
    }
    // Подпись масштаба меняется сразу, а содержимое получает масштаб склеенной
    // серией (см. `createZoomCoalescer`): ждём, пока страница отрисуется в новом
    // масштабе, иначе дальнейшие замеры попадут в промежуточное состояние.
    await waitForZoomRendered(page);
}

/** Ожидание отрисовки страниц в применённом масштабе. */
async function waitForZoomRendered(page: Page) {
    await content(page)
        .locator('#viewer')
        .evaluate(
            () =>
                new Promise<void>((resolve) => {
                    // Два кадра подряд с неизменной шириной страницы: отрисовка
                    // завершена и размер стабилен.
                    let previous = -1;
                    let stable = 0;
                    const step = () => {
                        const pageEl = document.querySelector('.page') as HTMLElement | null;
                        const width = pageEl ? Math.round(pageEl.getBoundingClientRect().width) : -1;
                        stable = width === previous && width > 0 ? stable + 1 : 0;
                        previous = width;
                        if (stable >= 3) {
                            resolve();
                            return;
                        }
                        requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                }),
        );
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
            const residual = (value: number) => Math.abs(value * dpr - Math.round(value * dpr));
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

/** Возврат на область рабочего места после перезагрузки. */
async function reopenWorkplace(page: Page) {
    await openWorkspaceArea(page);
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
    await expect(page.getByLabel('Текущая страница')).toHaveValue('1');
    await expect(page.getByTestId('reader-page-count')).toHaveText('/ 3');
});

test('поиск по книге PDF: находит текст, переходит по вхождениям и не тормозит', async ({
    page,
}) => {
    // Большая книга: поиск обязан начинать с текущей страницы и показывать
    // найденное, не дожидаясь разбора всех страниц.
    await openPdf(page, 120);

    await page.getByTestId('note-toolbar').getByRole('button', { name: 'Поиск по книге' }).click();
    const search = page.getByTestId('reader-search');
    const started = Date.now();
    await search.getByRole('textbox', { name: 'Поиск по книге' }).fill('Page 90');

    // Первое найденное показано быстро: страница вхождения и подсветка.
    await expect(search.getByTestId('reader-search-counter')).toHaveText(/\d/);
    expect(Date.now() - started).toBeLessThan(5000);
    await expect.poll(async () => page.getByLabel('Текущая страница').inputValue()).toBe('90');
    // Найденное — отдельный слой полос над растром, а не разметка внутри
    // прозрачного текстового слоя: заливка в нём ложилась плёнкой поверх букв.
    const layer = content(page).locator('.search-layer');
    await expect(layer).toBeAttached();
    await expect(layer.locator('.search-hit').first()).toBeAttached();
    expect(await content(page).locator('.textLayer mark').count()).toBe(0);
    // Полосы смешиваются с растром наложением и текст не закрывают.
    const blend = await layer
        .locator('.search-hit')
        .first()
        .evaluate((el) => getComputedStyle(el as HTMLElement).mixBlendMode);
    expect(blend).toBe('multiply');
    // Активное вхождение отличается от остальных.
    await expect(layer.locator('.search-hit-active').first()).toBeAttached();

    // Интерфейс живой после поиска: масштаб отвечает сразу.
    const zoom = page.getByTestId('reader-zoom');
    const before = await zoom.textContent();
    await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
    await expect.poll(async () => zoom.textContent()).not.toBe(before);
});

test('масштаб идёт по обратимой шкале уровней', async ({ page }) => {
    await openPdf(page, 3);
    const zoom = page.getByTestId('reader-zoom');
    const bigger = page.getByRole('button', { name: 'Увеличить масштаб' });
    const smaller = page.getByRole('button', { name: 'Уменьшить масштаб' });

    /** Нажатие кнопки масштаба с ожиданием нового значения. */
    const step = async (button: typeof bigger, expected: string) => {
        const before = await zoom.textContent();
        await button.click();
        await expect.poll(async () => zoom.textContent()).not.toBe(before);
        await expect(zoom).toHaveText(expected);
    };

    // Уровни шкалы: 100 → 110 → 120 (шаг 10 у удобного масштаба).
    await step(bigger, '110%');
    await step(bigger, '120%');

    // Уменьшение возвращает к тем же уровням — шкала обратима.
    await step(smaller, '110%');
    await step(smaller, '100%');

    // Прогрессивность: у крупного масштаба шаг больше, чем у удобного.
    // От 100 % уровни идут 110…180, 200, 220, 250, 300, 350, 400, 500.
    for (let index = 0; index < 15; index += 1) {
        await bigger.click();
    }
    await expect.poll(async () => zoom.textContent()).toBe('500%');
    await step(bigger, '600%');
});

test('тема области чтения перекрашивает и фон плагина, и страницу', async ({ page }) => {
    await openPdf(page, 2);

    const pluginRoot = content(page).locator('html');
    const body = content(page).locator('body');
    const canvas = content(page).locator('.page canvas').first();
    await expect(pluginRoot).toHaveAttribute('data-reader-theme', 'light');
    const lightBackground = await body.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
    );
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

test('смена темы области чтения перекрашивает страницу без шевеления', async ({ page }) => {
    await openPdf(page, 4);

    const canvas = content(page).locator('.page canvas').first();
    await expect.poll(async () => (await paperColor(canvas)) !== null).toBe(true);
    const before = await paperColor(canvas);

    // Тема области чтения переключается кнопкой в панели чтения; та же кнопка
    // работает и в постраничных форматах.
    await page.getByLabel('Тёмная тема области чтения').click();
    await expect(page.locator('html')).toHaveAttribute('data-reader-theme', 'dark');
    await expect.poll(async () => (await paperColor(canvas)) !== before).toBe(true);

    // Открытие и закрытие настроек не должны сбрасывать оформление чтения.
    await page.getByLabel('Настройки', { exact: true }).click();
    await page.getByLabel('Закрыть настройки').click();
    await expect(page.locator('html')).toHaveAttribute('data-reader-theme', 'dark');

    // Возврат к рабочему месту без прокрутки, смены масштаба и потери фокуса:
    // страница должна перекраситься сама, по восстановлению размера области.
    await reopenWorkplace(page);
    await expect
        .poll(async () => {
            const paper = await paperColor(canvas);
            return paper !== null && paper.r < 140;
        })
        .toBe(true);

    // Прокрутка к другой странице и назад не должна возвращать прежнюю
    // раскраску: и вновь нарисованная страница, и прежняя остаются тёмными.
    const scrollHeight = await content(page)
        .locator('#viewer')
        .evaluate((element) => element.scrollHeight);
    // Прокрутка доступна сразу после перекраски (не пропала).
    expect(scrollHeight).toBeGreaterThan(0);
    await content(page)
        .locator('#viewer')
        .evaluate((element) => {
            element.scrollTop = element.scrollHeight;
        });
    const laterCanvas = content(page).locator('.page canvas').last();
    await expect
        .poll(async () => {
            const paper = await paperColor(laterCanvas);
            return paper !== null && paper.r < 140;
        })
        .toBe(true);
    await content(page)
        .locator('#viewer')
        .evaluate((element) => {
            element.scrollTop = 0;
        });
    await expect
        .poll(async () => {
            const paper = await paperColor(canvas);
            return paper !== null && paper.r < 140;
        })
        .toBe(true);
});

// Переход по страницам кнопкой не пересобирает документ: соседняя страница
// остаётся смонтированной. Смена темы должна довести и её — иначе переход
// показывал бы страницу в прежней раскраске, хотя текущая уже перекрашена.
test('переход на следующую страницу показывает её в новой теме', async ({ page }) => {
    await openPdf(page, 4);

    await page
        .getByTestId('note-toolbar')
        .getByRole('button', { name: 'Тёмная тема области чтения' })
        .click();
    await expect(content(page).locator('html')).toHaveAttribute('data-reader-theme', 'dark');
    // Первая страница перекрашивается сразу (она видима).
    const first = content(page).locator('.page canvas').first();
    await expect
        .poll(async () => {
            const paper = await paperColor(first);
            return paper !== null && paper.r < 140;
        })
        .toBe(true);

    await page.getByRole('button', { name: 'Следующая страница' }).click();
    await expect(page.getByLabel('Текущая страница')).toHaveValue('2');
    const second = content(page).locator('.page canvas').nth(1);
    await expect
        .poll(async () => {
            const paper = await paperColor(second);
            return paper !== null && paper.r < 140;
        })
        .toBe(true);
});

test('листание по страницам обновляет номер и прогресс', async ({ page }) => {
    await openPdf(page, 4);

    await expect(page.getByLabel('Текущая страница')).toHaveValue('1');
    await page.getByRole('button', { name: 'Следующая страница' }).click();
    await expect(page.getByLabel('Текущая страница')).toHaveValue('2');
    await expect(content(page).locator('.page canvas').nth(1)).toBeVisible();

    await page.getByRole('button', { name: 'Предыдущая страница' }).click();
    await expect(page.getByLabel('Текущая страница')).toHaveValue('1');
});

test('прокрутка переводит текущую страницу', async ({ page }) => {
    await openPdf(page, 6);

    await content(page)
        .locator('#viewer')
        .evaluate((element) => {
            element.scrollTop = element.scrollHeight;
        });

    await expect
        .poll(async () => await page.getByLabel('Текущая страница').inputValue(), {
            timeout: 15000,
        })
        .toBe('6');
});

test('переход к номеру страницы', async ({ page }) => {
    await openPdf(page, 4);

    await page.getByLabel('Текущая страница').fill('3');
    await page.getByLabel('Текущая страница').press('Enter');

    await expect
        .poll(async () => await page.getByLabel('Текущая страница').inputValue(), {
            timeout: 15000,
        })
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
    await expect(page.getByLabel('Текущая страница')).toHaveValue('3');

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
    await expect(page.getByLabel('Текущая страница')).toHaveValue('3');
});

test('масштаб меняет размер страницы, не меняя номер', async ({ page }) => {
    await openPdf(page, 3);

    await page.getByRole('button', { name: 'Следующая страница' }).click();
    await expect(page.getByLabel('Текущая страница')).toHaveValue('2');

    const pageEl = content(page).locator('.page').nth(1);
    const before = await pageEl.evaluate((element) => element.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
    await expect
        .poll(async () => pageEl.evaluate((element) => element.getBoundingClientRect().width))
        .toBeGreaterThan(before);
    await expect(page.getByLabel('Текущая страница')).toHaveValue('2');
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
    const bigger = page.getByRole('button', { name: 'Увеличить масштаб' });
    while (await bigger.isEnabled()) {
        await bigger.click();
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
                const canvases = Array.from(document.querySelectorAll('.page canvas')).map(
                    (canvas) => canvas.getBoundingClientRect(),
                );
                let total = 0;
                let blank = 0;
                for (let y = viewerRect.top + 20; y < viewerRect.bottom - 20; y += 40) {
                    for (let x = viewerRect.left + 40; x < viewerRect.right - 40; x += 160) {
                        const pageEl = Array.from(pagesHost.children).find((candidate) => {
                            const rect = candidate.getBoundingClientRect();
                            return (
                                x >= rect.left &&
                                x <= rect.right &&
                                y >= rect.top &&
                                y <= rect.bottom
                            );
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
    await page.getByTestId('workplace-notes-toggle').click();

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
    await page.getByTestId('workplace-notes-toggle').click();

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
            const spans = Array.from(document.querySelectorAll('.page .textLayer span')).filter(
                (span) => span.firstChild,
            );
            const rects = spans.map((span) => span.getBoundingClientRect());
            let overlap = 0;
            for (let index = 1; index < rects.length; index += 1) {
                overlap = Math.max(overlap, rects[index - 1].bottom - rects[index].top);
            }
            return overlap;
        });
    expect(rawOverlap).toBeGreaterThan(0);
});

// Выделение текста рисует собственный слой, а не браузер: заливка — единый
// элемент, обрезанный маской по прямоугольникам диапазона (как официальный
// просмотрщик pdf.js). Перекрытие строк по высоте не темнеет на стыках, а полоса
// совпадает с нативным выделением и не сужается до середины букв. Вертикальные
// метки («курсоры») стоят только у краёв всего выделения.
test('выделение текста ложится ровными полосами, не перекрываясь', async ({ page }) => {
    await openPdf(page, 3, true);

    const selection = await content(page)
        .locator('.page')
        .first()
        .locator('.textLayer')
        .evaluate((layer) => {
            const spans = Array.from(layer.querySelectorAll('span')).filter(
                (span) => span.firstChild,
            );
            if (spans.length < 2) {
                return null;
            }
            const document = layer.ownerDocument;
            const range = document.createRange();
            range.setStartBefore(spans[0]);
            range.setEndAfter(spans[spans.length - 1]);
            const selected = document.getSelection();
            selected?.removeAllRanges();
            selected?.addRange(range);
            spans[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            const page = layer.closest('.page') as HTMLElement;
            const bounds = page.getBoundingClientRect();
            const native = Array.from(range.getClientRects()).filter(
                (rect) => rect.width > 0 && rect.height > 0,
            );
            return {
                native: {
                    top: Math.min(...native.map((rect) => rect.top - bounds.top)),
                    bottom: Math.max(...native.map((rect) => rect.bottom - bounds.top)),
                    left: Math.min(...native.map((rect) => rect.left - bounds.left)),
                    right: Math.max(...native.map((rect) => rect.right - bounds.left)),
                },
            };
        });
    expect(selection).not.toBeNull();

    await expect(content(page).locator('.selection-layer')).toHaveCount(1);
    // Заливка — один элемент во всю страницу, обрезанный маской: полосы не
    // рисуются отдельными блоками, поэтому стыки не темнеют.
    const fill = content(page).locator('.selection-fill');
    await expect(fill).toHaveCount(1);
    const clip = await fill.evaluate((element) => getComputedStyle(element).clipPath);
    expect(clip).toContain('url(');
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
    const blend = await fill.evaluate((element) => getComputedStyle(element).mixBlendMode);
    expect(blend).toBe('multiply');
    // Маска заливки совпадает с нативным выделением по горизонтали; по
    // вертикали полосы приводятся к межстрочному шагу (см. `tileByLine`).
    const pageBox = await content(page).locator('.page').first().boundingBox();
    expect(pageBox).not.toBeNull();
    const mask = await fill.locator('path').evaluate((path) => path.getAttribute('d') ?? '');
    const boxes = mask.match(/M[-\d.eE]+ [-\d.eE]+h[-\d.eE]+v[-\d.eE]+h-[-\d.eE]+Z/g) ?? [];
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    const bounds = boxes.reduce(
        (acc, box) => {
            const [x, y, width, height] = box
                .match(/[-\d.eE]+/g)!
                .map((value) => Number.parseFloat(value));
            return {
                left: Math.min(acc.left, x),
                top: Math.min(acc.top, y),
                right: Math.max(acc.right, x + width),
                bottom: Math.max(acc.bottom, y + height),
            };
        },
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    expect(Math.abs(bounds.left * pageBox!.width - selection!.native.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(bounds.right * pageBox!.width - selection!.native.right)).toBeLessThanOrEqual(
        2,
    );
    // По вертикали полосы приводятся к межстрочному шагу: полосы-метки (по одной
    // на строку) соседних строк стыкуются встык — без щелей и без нахлёста.
    const bands = await content(page)
        .locator('.selection-band')
        .evaluateAll((elements) =>
            elements
                .map((element) => element.getBoundingClientRect())
                .sort((a, b) => a.top - b.top)
                .map((rect) => ({ top: rect.top, bottom: rect.bottom })),
        );
    for (let index = 1; index < bands.length; index += 1) {
        const gap = bands[index].top - bands[index - 1].bottom;
        expect(gap).toBeLessThanOrEqual(1);
        expect(gap).toBeGreaterThanOrEqual(-1);
    }
    // Признак живого выделения: вертикальные метки стоят только у краёв всего
    // выделения — левая в начале, правая в конце. У промежуточных строк меток
    // нет, иначе они читаются как отдельные выделения (особенно при строках
    // разной длины). Так же ведёт себя встроенное чтение EPUB.
    const edges = await content(page)
        .locator('.selection-band')
        .evaluateAll((elements) =>
            elements.map((element) => (element as HTMLElement).dataset.edge),
        );
    expect(edges.length).toBeGreaterThanOrEqual(2);
    expect(edges[0]).toBe('start');
    expect(edges[edges.length - 1]).toBe('end');
    expect(edges.slice(1, -1).every((edge) => edge === 'none')).toBe(true);

    const first = await content(page)
        .locator('.selection-band')
        .first()
        .evaluate((band) => {
            const before = getComputedStyle(band, '::before');
            const after = getComputedStyle(band, '::after');
            return {
                beforeContent: before.content,
                afterContent: after.content,
                beforeWidth: before.width,
                beforeLeft: before.left,
            };
        });
    // У начала выделения метка слева есть (генерённый псевдоэлемент), справа — нет.
    expect(first.beforeContent).not.toBe('none');
    expect(first.afterContent).toBe('none');
    expect(first.beforeWidth).not.toBe('0px');
    // Метка центрируется на границе полосы: её середина совпадает с краем
    // выделения, поэтому сдвиг — ровно на полширины (внутрь и наружу поровну),
    // и полоса не кажется шире на толщину метки.
    const beforeWidth = Number.parseFloat(first.beforeWidth);
    const beforeLeft = Number.parseFloat(first.beforeLeft);
    expect(beforeLeft).toBeLessThan(0);
    expect(Math.abs(beforeLeft + beforeWidth / 2)).toBeLessThanOrEqual(0.5);

    const last = await content(page)
        .locator('.selection-band')
        .last()
        .evaluate((band) => ({
            afterContent: getComputedStyle(band, '::after').content,
            afterRight: getComputedStyle(band, '::after').right,
            afterWidth: getComputedStyle(band, '::after').width,
        }));
    expect(last.afterContent).not.toBe('none');
    const afterWidth = Number.parseFloat(last.afterWidth);
    const afterRight = Number.parseFloat(last.afterRight);
    expect(afterRight).toBeLessThan(0);
    expect(Math.abs(afterRight + afterWidth / 2)).toBeLessThanOrEqual(0.5);
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
    await page.getByTestId('workplace-notes-toggle').click();
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
    await page.getByTestId('workplace-notes-toggle').click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(content(page).locator('.note')).toHaveCount(1);
});

test('клик по заметке ведёт к странице заметки', async ({ page }) => {
    await openPdf(page, 4);
    await page.getByTestId('workplace-notes-toggle').click();
    await page.getByLabel('Текущая страница').fill('3');
    await page.getByLabel('Текущая страница').press('Enter');
    await expect
        .poll(async () => await page.getByLabel('Текущая страница').inputValue(), {
            timeout: 15000,
        })
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
    await page.getByTestId('workplace-notes-toggle').click();
    await selectTextOnPage(page, 1);
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    await page.getByTestId('workplace-notes-toggle').click();
    await expect(page.getByTestId('notes-panel')).toHaveCount(0);

    await content(page).locator('.note').first().click();

    await expect(page.getByTestId('notes-panel')).toBeVisible();
    await expect(page.getByTestId('notes-item')).toHaveAttribute('data-selected', 'true');
});

/** Выбор инструмента заметок в панели инструментов рабочего места. */
async function selectTool(page: Page, name: string) {
    await page.getByTestId('note-toolbar').getByRole('button', { name }).click();
}

test('меню цитаты копирует текст в буфер обмена', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openPdf(page, 3);
    await page.getByTestId('workplace-notes-toggle').click();
    await selectTextOnPage(page, 1);
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    // Клик по цитате открывает меню, кнопка копирования кладёт её текст в буфер
    // обмена и закрывает меню.
    await content(page).locator('.overlay .note').first().click();
    const menu = page.getByTestId('note-menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'Копировать текст' }).click();
    await expect(menu).toHaveCount(0);

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Page 1');
});

test('текстовая карточка создаётся кликом по странице', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByTestId('workplace-notes-toggle').click();

    // Страничный формат сохраняет все три типа: текст и фигура доступны.
    const toolbar = page.getByTestId('note-toolbar');
    await expect(toolbar.getByRole('button', { name: 'Цитата' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Текст' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Фигура' })).toBeVisible();

    await selectTool(page, 'Текст');
    await content(page)
        .locator('.page')
        .first()
        .click({ position: { x: 120, y: 120 } });

    const editor = page.getByTestId('text-card-editor');
    await expect(editor).toBeVisible();
    await editor.getByLabel('Текст заметки').fill('Мысль о странице');
    await editor.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(page.getByTestId('notes-item-type')).toHaveText('Текст');
    await expect(content(page).locator('.note-card').first()).toHaveText('Мысль о странице');

    // После создания карточки инструмент возвращается к «цитате»: следующая
    // заметка по умолчанию снова цитата.
    await expect(toolbar.getByRole('button', { name: 'Цитата' })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(toolbar.getByRole('button', { name: 'Текст' })).toHaveAttribute(
        'aria-pressed',
        'false',
    );

    // Название и комментарий доступны заметке любого типа и правятся в панели.
    await page.getByLabel('Действия с заметкой').first().click();
    await page.getByRole('menuitem', { name: 'Изменить' }).click();
    await page.getByLabel('Название заметки').fill('Мысль');
    await page.getByLabel('Комментарий заметки').fill('Вернуться к ней');
    await page.getByTestId('notes-item-editor').getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByTestId('notes-item-link')).toContainText('Мысль');
    await expect(page.getByTestId('notes-item-comment')).toHaveText('Вернуться к ней');
});

test('текст карточки правится из её контекстного меню', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByTestId('workplace-notes-toggle').click();

    await selectTool(page, 'Текст');
    await content(page)
        .locator('.page')
        .first()
        .click({ position: { x: 120, y: 120 } });
    const editor = page.getByTestId('text-card-editor');
    await editor.getByLabel('Текст заметки').fill('Первая мысль');
    await editor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    // Правка текста доступна из меню карточки на странице: открывается то же
    // модальное окно, что при создании, с текущим текстом и цветом.
    const card = content(page).locator('.note-card').first();
    await card.click();
    await page.getByTestId('note-menu').getByRole('button', { name: 'Изменить текст' }).click();
    const edit = page.getByTestId('text-card-editor');
    await expect(edit).toBeVisible();
    await expect(edit.getByLabel('Текст заметки')).toHaveValue('Первая мысль');
    await edit.getByLabel('Текст заметки').fill('Уточнённая мысль');
    await edit.getByRole('button', { name: 'синий' }).click();
    await edit.getByRole('button', { name: 'Сохранить' }).click();

    // Текст обновился и на странице, и в списке заметок; цвет тоже применён.
    await expect(content(page).locator('.note-card').first()).toHaveText('Уточнённая мысль');
    await expect(page.getByTestId('notes-item-link')).toContainText('Уточнённая мысль');
    await expect(page.getByTestId('notes-item')).toHaveAttribute('data-color', 'blue');
});

test('над существующей заметкой под инструментом «текст» курсор кликабельности', async ({
    page,
}) => {
    await openPdf(page, 3);
    await page.getByTestId('workplace-notes-toggle').click();

    await selectTool(page, 'Текст');
    await content(page)
        .locator('.page')
        .first()
        .click({ position: { x: 120, y: 120 } });
    const editor = page.getByTestId('text-card-editor');
    await editor.getByLabel('Текст заметки').fill('Мысль');
    await editor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    // Новая карточка поверх существующей не ставится: клик открывает её меню,
    // но сама заметка кликабельна — курсор это показывает.
    await selectTool(page, 'Текст');
    const cursor = await content(page)
        .locator('.note-card')
        .first()
        .evaluate((element) => getComputedStyle(element).cursor);
    expect(cursor).toBe('pointer');
});

test('фигура рисуется протяжкой по странице', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByTestId('workplace-notes-toggle').click();

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

test('на узком окне панель инструментов — две строки: снизу тема, масштаб, навигация', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openPdf(page, 3);

    // Фигура добавляет в панель выбор вида и цвет: самая широкая раскладка.
    await selectTool(page, 'Фигура');

    const toolbar = await page.getByTestId('note-toolbar').boundingBox();
    const types = await page.getByRole('group', { name: 'Тип заметки' }).boundingBox();
    const shape = await page.getByTestId('note-tool-shape').boundingBox();
    const color = await page.getByTestId('note-tool-color-picker').boundingBox();
    const theme = await page.getByTestId('reader-theme-toggle').boundingBox();
    const zoom = await page.getByTestId('reader-zoom-group').boundingBox();
    const pages = await page.getByTestId('reader-pages').boundingBox();
    for (const box of [toolbar, types, shape, color, theme, zoom, pages]) {
        expect(box).not.toBeNull();
    }

    // Каждый инструмент целиком внутри панели: ничего не обрезано и не
    // вынесено за её пределы.
    for (const box of [types!, shape!, color!, theme!, zoom!, pages!]) {
        expect(box.x).toBeGreaterThanOrEqual(toolbar!.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(toolbar!.x + toolbar!.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(toolbar!.y + toolbar!.height + 1);
    }

    const rows = (list: Array<{ y: number; height: number }>) =>
        new Set(list.map((box) => Math.round(box.y + box.height / 2)));

    // Верхняя строка — инструменты заметок, цвет стоит в ней справа.
    expect(rows([types!, shape!, color!]).size).toBe(1);
    expect(color!.x).toBeGreaterThan(shape!.x + shape!.width - 1);
    // Нижняя строка — управление чтением, и начинается она с переключателя темы.
    expect(rows([theme!, zoom!, pages!]).size).toBe(1);
    expect(theme!.x).toBeLessThan(zoom!.x);
    expect(zoom!.x).toBeLessThan(pages!.x);
    expect(Math.abs(theme!.x - Math.round(toolbar!.x + 8))).toBeLessThanOrEqual(8);

    // Строки не пересекаются: инструменты выше управления чтением.
    expect(types!.y + types!.height).toBeLessThanOrEqual(theme!.y + 1);
});

test('фигура-эллипс рисуется и переживает смену масштаба', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByTestId('workplace-notes-toggle').click();

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
    await page.getByTestId('workplace-notes-toggle').click();

    await selectTool(page, 'Текст');
    await content(page)
        .locator('.page')
        .first()
        .click({ position: { x: 120, y: 120 } });
    const editor = page.getByTestId('text-card-editor');
    await editor.getByLabel('Текст заметки').fill('Сдвинь меня');
    await editor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    const card = content(page).locator('.note-card').first();
    await card.click();
    // Клик по карточке не открывает редактор, а лишь показывает меню заметки.
    // Инструмент при этом не меняется: после создания он сброшен на «цитату».
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

    await expect.poll(async () => card.evaluate((element) => element.style.left)).not.toBe(before);
});

test('клик по заметке не переключает инструмент', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByTestId('workplace-notes-toggle').click();

    await selectTool(page, 'Текст');
    await content(page)
        .locator('.page')
        .first()
        .click({ position: { x: 120, y: 120 } });
    const editor = page.getByTestId('text-card-editor');
    await editor.getByLabel('Текст заметки').fill('Сдвинь');
    await editor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    // Инструмент фигуры активен: клик по карточке не меняет инструмент, а лишь
    // открывает меню заметки (и панель с выбранной заметкой).
    await selectTool(page, 'Фигура');
    const card = content(page).locator('.note-card').first();
    await card.click();
    await expect(
        page.getByTestId('note-toolbar').getByRole('button', { name: 'Фигура' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
        page.getByTestId('note-toolbar').getByRole('button', { name: 'Текст' }),
    ).toHaveAttribute('aria-pressed', 'false');
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

    await expect.poll(async () => card.evaluate((element) => element.style.left)).not.toBe(before);
});

test('фигуру в PDF можно выбрать кликом по контуру', async ({ page }) => {
    await openPdf(page, 3);
    await page.getByTestId('workplace-notes-toggle').click();

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
    await page.getByTestId('workplace-notes-toggle').click();
    await selectTextOnPage(page, 1);

    await content(page).locator('.overlay .note').first().click();
    await expect(page.getByTestId('note-menu')).toBeVisible();
    await page.getByTestId('note-menu').getByRole('button', { name: 'Изменить выделение' }).click();
    await expect(content(page).locator('.note-handle')).toHaveCount(2);
});

// Возврат из настроек возвращает область чтения из `display: none`. В WebKitGTK
// такая область может перестать считаться прокручиваемой, хотя содержимое выше
// окна: колесо прокручивает документ, а не страницу. Плагин на сообщение `show`
// переустанавливает `overflow`, заставляя движок пересчитать прокрутку, и это не
// сбрасывает положение.
test('прокрутка после возврата из настроек со сменой темы работает', async ({ page }) => {
    await openPdf(page, 6);

    // Тема переключается кнопкой панели чтения, затем раздел чтения скрывается
    // настройками и возвращается — прокрутка должна работать как прежде.
    await page.getByLabel('Тёмная тема области чтения').click();
    await expect(page.locator('html')).toHaveAttribute('data-reader-theme', 'dark');
    await page.getByLabel('Настройки', { exact: true }).click();
    await page.getByLabel('Закрыть настройки').click();
    await reopenWorkplace(page);

    const viewer = content(page).locator('#viewer');
    const box = await viewer.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, 400);
    await expect
        .poll(async () => await viewer.evaluate((element) => (element as HTMLElement).scrollTop))
        .toBeGreaterThan(0);
});

// Слой выделения должен повторять геометрию нативного выделения по горизонтали
// и стыковаться по вертикали с межстрочным шагом (как в официальном просмотрщике
// pdf.js). Раньше заливка брала прямоугольники диапазона как есть: у встроенного
// шрифта бокс ниже шага (щели), у запасного — выше (нахлёст на соседние строки).
// Теперь полосы приводятся к шагу: стыкуются встык без щелей и нахлёста.
test('полоса выделения стыкуется по межстрочному шагу', async ({ page }) => {
    await openPdf(page, 1, true);

    const geometry = await content(page)
        .locator('.page')
        .first()
        .evaluate((element) => {
            const spans = Array.from(element.querySelectorAll('.textLayer span')).filter(
                (span) => span.firstChild,
            ) as HTMLElement[];
            if (spans.length < 2) {
                return null;
            }
            const doc = element.ownerDocument;
            const range = doc.createRange();
            range.setStartBefore(spans[0]);
            range.setEndAfter(spans[spans.length - 1]);
            const selection = doc.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            spans[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            const pageBounds = element.getBoundingClientRect();
            const nativeRects = Array.from(range.getClientRects()).filter(
                (rect) => rect.width > 0 && rect.height > 0,
            );
            return {
                nativeTop: Math.min(...nativeRects.map((rect) => rect.top - pageBounds.top)),
                nativeBottom: Math.max(...nativeRects.map((rect) => rect.bottom - pageBounds.top)),
                nativeLeft: Math.min(...nativeRects.map((rect) => rect.left - pageBounds.left)),
                nativeRight: Math.max(...nativeRects.map((rect) => rect.right - pageBounds.left)),
                pageWidth: pageBounds.width,
                pageHeight: pageBounds.height,
            };
        });
    expect(geometry).not.toBeNull();

    // Заливка — один элемент, обрезанный маской по прямоугольникам диапазона.
    const mask = await content(page)
        .locator('.selection-fill path')
        .evaluate((path) => path.getAttribute('d') ?? '');
    const boxes = (mask.match(/M[-\d.eE]+ [-\d.eE]+h[-\d.eE]+v[-\d.eE]+h-[-\d.eE]+Z/g) ?? []).map(
        (box) => {
            const [x, y, width, height] = box
                .match(/[-\d.eE]+/g)!
                .map((value) => Number.parseFloat(value));
            return { x, y, width, height, right: x + width, bottom: y + height };
        },
    );
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    // Полосы соседних строк стыкуются по шагу: ни щелей, ни нахлёста. Прежний
    // контракт «заливка = нативные прямоугольники» давал щели (низкий бокс
    // встроенного шрифта) или нахлёст (высокий бокс запасного `monospace`).
    // Полосы-метки — по одной на строку (в маске заливки куски строки могут
    // повторяться, поэтому вертикальные стыки проверяются по ним).
    const bands = await content(page)
        .locator('.selection-band')
        .evaluateAll((elements) =>
            elements
                .map((element) => element.getBoundingClientRect())
                .sort((a, b) => a.top - b.top)
                .map((rect) => ({ top: rect.top, bottom: rect.bottom })),
        );
    for (let index = 1; index < bands.length; index += 1) {
        const gap = bands[index].top - bands[index - 1].bottom;
        expect(gap).toBeLessThanOrEqual(1);
        expect(gap).toBeGreaterThanOrEqual(-1);
    }
    // Горизонталь совпадает с нативным выделением: полосы не сужаются.
    const maskLeft = Math.min(...boxes.map((box) => box.x)) * geometry!.pageWidth;
    const maskRight = Math.max(...boxes.map((box) => box.right)) * geometry!.pageWidth;
    expect(Math.abs(maskLeft - geometry!.nativeLeft)).toBeLessThanOrEqual(2);
    expect(Math.abs(maskRight - geometry!.nativeRight)).toBeLessThanOrEqual(2);
});

// Скан с невидимым OCR-слоем: невидимый текст спозиционирован короче растра.
// Правый край невидимой строки подгоняется под пятно чернил растра, иначе
// выделение (и цитата) справа короче видимой строки на одну-две буквы.
test('текстовый слой скана дотягивается до правого края растра', async ({ page }) => {
    await openPdf(page, 1, false, pdfScanBase64());

    const metrics = await content(page)
        .locator('.page')
        .first()
        .evaluate((element) => {
            const canvas = element.querySelector('canvas');
            const textLayer = element.querySelector('.textLayer');
            const span = textLayer?.querySelector('span');
            if (!(canvas instanceof HTMLCanvasElement) || !span) {
                return null;
            }
            const canvasRect = canvas.getBoundingClientRect();
            const spanRect = span.getBoundingClientRect();
            const ratio = canvasRect.width > 0 ? canvas.width / canvasRect.width : 1;
            const context = canvas.getContext('2d');
            if (!context) {
                return null;
            }
            const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let inkRight = -1;
            for (let y = 0; y < canvas.height; y += 1) {
                for (let x = 0; x < canvas.width; x += 1) {
                    const offset = (y * canvas.width + x) * 4;
                    const luminance = (image[offset] + image[offset + 1] + image[offset + 2]) / 3;
                    if (image[offset + 3] > 0 && luminance < 150 && x > inkRight) {
                        inkRight = x;
                    }
                }
            }
            if (inkRight < 0) {
                return null;
            }
            return {
                inkRight: (inkRight + 1) / ratio,
                spanRight: spanRect.right - canvasRect.left,
            };
        });

    expect(metrics).not.toBeNull();
    // Раньше невидимый слой не доходил до растра на ~9 px; теперь совпадает.
    expect(Math.abs(metrics!.spanRight - metrics!.inkRight)).toBeLessThanOrEqual(2);
});

// Цифровая страница со встроенным шрифтом: pdf.js раскладывал невидимый слой
// запасным шрифтом (`serif`/`sans-serif`), а ширину строки подгонял сжатием
// (`scaleX`). Пока метрики запасного шрифта близки к встроенному, буквы стоят
// верно; но в WebKitGTK запасной шрифт заметно шире, и буквы внутри длинной
// строки уезжали на целую букву — выделение и цитата смещались (выделение
// «века» давало «ека »). Слой должен стоять на встроенном шрифте страницы:
// тогда ширина любой подстроки в слое совпадает с ширинами PDF, и буква под
// точкой — та самая.
test('текстовый слой цифровой страницы ставит буквы по встроенному шрифту', async ({ page }) => {
    await openPdf(page, 1, false, pdfEmbeddedFontBase64());

    const measured = await content(page)
        .locator('.page')
        .first()
        .evaluate((element) => {
            const textLayer = element.querySelector('.textLayer');
            const span = textLayer?.querySelector('span');
            if (!span || !span.firstChild) {
                return null;
            }
            const pageWidth = element.getBoundingClientRect().width;
            const fontSize = 24;
            // Ширины глифов строки (1/1000 кегля) — те же, что в `/Widths` фикстуры.
            const widths = [
                301, 0, 0, 368, 435, 0, 502, 0, 266, 0, 0, 333, 400, 467, 0, 0, 0, 534, 298, 365,
                432, 0, 0, 0, 499,
            ];
            const text = 'misunderstandingly';
            const word = 'understandingly';
            const start = text.indexOf(word);
            const range = document.createRange();
            range.setStart(span.firstChild, start);
            range.setEnd(span.firstChild, start + word.length);
            let expected = 0;
            for (const character of word) {
                expected += widths[character.charCodeAt(0) - 97];
            }
            // Ширина слова в точках (1/1000 кегля) → в пикселях страницы.
            expected = (expected * fontSize * pageWidth) / (1000 * 612);
            return {
                fontFamily: getComputedStyle(span).fontFamily.split(',')[0].trim(),
                width: range.getBoundingClientRect().width,
                expected,
            };
        });

    expect(measured).not.toBeNull();
    // Слой стоит на встроенном шрифте страницы, а не на подстановочном.
    expect(measured!.fontFamily).not.toBe('sans-serif');
    // Ширина слова в слое совпадает с шириной по метрикам PDF: буквы не уехали.
    expect(Math.abs(measured!.width - measured!.expected)).toBeLessThanOrEqual(3);
});

// Высота полосы выделения берётся из инлайн-бокса шрифта слоя, а он может быть
// и ниже межстрочного шага (встроенный шрифт цифровой страницы — щели), и выше
// него (запасной `monospace` на сканах — нахлёст на соседние строки). Полосы
// приводятся к межстрочному шагу (см. `tileByLine` во вьюере): соседние полосы
// стыкуются встык при любой высоте бокса. Проверяется на шрифте с заниженными
// вертикальными метриками, где прежде между полосами была щель.
test('полосы выделения стыкуются по межстрочному шагу', async ({ page }) => {
    await openPdf(page, 1, false, pdfEmbeddedFontBase64());

    const gap = await content(page)
        .locator('.page')
        .first()
        .evaluate((element) => {
            const spans = Array.from(element.querySelectorAll('.textLayer span')).filter(
                (span) => span.firstChild && (span.textContent ?? '').trim().length > 1,
            ) as HTMLElement[];
            if (spans.length < 2) {
                return null;
            }
            const doc = element.ownerDocument;
            const range = doc.createRange();
            range.setStart(spans[0].firstChild!, 0);
            range.setEnd(spans[spans.length - 1].firstChild!, spans[spans.length - 1].firstChild!.length);
            const selection = doc.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            spans[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            return new Promise<{ gap: number }>((resolve) => {
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => {
                        const pageBox = element.getBoundingClientRect();
                        const bands = Array.from(element.querySelectorAll('.selection-band'))
                            .map((band) => {
                                const rect = band.getBoundingClientRect();
                                return {
                                    top: rect.top - pageBox.top,
                                    bottom: rect.bottom - pageBox.top,
                                };
                            })
                            .sort((a, b) => a.top - b.top);
                        // Зазор между полосами соседних строк: >0 — щель, <0 — нахлёст.
                        const gaps = [];
                        for (let index = 1; index < bands.length; index += 1) {
                            gaps.push(bands[index].top - bands[index - 1].bottom);
                        }
                        resolve({ gap: Math.max(...gaps) });
                    }),
                );
            });
        });

    expect(gap).not.toBeNull();
    // Соседние полосы стыкуются: ни щели, ни нахлёста на соседнюю строку.
    expect(gap!.gap).toBeLessThanOrEqual(0.5);
    expect(gap!.gap).toBeGreaterThanOrEqual(-0.5);
});

// Страница шире области чтения на 100 % не должна быть обрезана слева. Раньше
// `#pages` центрировала страницы (`align-items: center`), и широкая страница
// уходила влево за недостижимый край прокрутки: текст начинался «с середины
// слова». Теперь контейнер растягивается под страницу, и левый край виден.
test('страница шире области чтения доступна от левого края', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await openPdf(page, 1, false, pdfBase64Sized(900, 1300));

    const metrics = await content(page)
        .locator('#viewer')
        .evaluate(() => {
            const viewer = document.querySelector('#viewer') as HTMLElement;
            const pageEl = document.querySelector('.page') as HTMLElement;
            const viewerRect = viewer.getBoundingClientRect();
            const pageRect = pageEl.getBoundingClientRect();
            return {
                overflowX: viewer.scrollWidth > viewer.clientWidth + 1,
                leftGap: Math.round(pageRect.left - viewerRect.left),
            };
        });

    // Страница шире области чтения — есть горизонтальная прокрутка и левый край
    // страницы не обрезан.
    expect(metrics.overflowX).toBe(true);
    expect(metrics.leftGap).toBe(0);
});

test('серия нажатий масштаба даёт один переход', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openPdf(page, 3);
    await setZoom(page, 200);
    // Резкость до серии: растр должен быть плотнее CSS-пикселей.
    const density = () =>
        content(page)
            .locator('.page canvas')
            .first()
            .evaluate((canvas: HTMLCanvasElement) => ({
                px: canvas.width,
                css: Math.round(canvas.getBoundingClientRect().width),
            }));
    const before = await density();

    const widths: number[] = [];
    for (let index = 0; index < 8; index += 1) {
        await page.getByRole('button', { name: 'Уменьшить масштаб' }).click();
        await page.waitForTimeout(250);
    }
    const until = Date.now() + 12000;
    let last = -1;
    while (Date.now() < until) {
        const value = await density();
        if (value.px !== last) {
            widths.push(value.px);
            last = value.px;
        }
        await page.waitForTimeout(70);
    }
    // Один переход на серию: промежуточные масштабы не отрисовываются.
    expect(new Set(widths).size, JSON.stringify(widths)).toBe(1);
    // Растр после серии той же плотности: масштаб не «прорисован» по шагам.
    const after = await density();
    expect(after.px / after.css).toBeCloseTo(before.px / before.css, 1);
});

test.describe('плотность растра на экране высокой плотности', () => {
    test.use({ deviceScaleFactor: 2 });

    test('растр PDF плотнее CSS-пикселей', async ({ page }) => {
        await page.setViewportSize({ width: 1400, height: 900 });
        await openPdf(page, 2);
        const info = await content(page)
            .locator('.page canvas')
            .first()
            .evaluate((canvas: HTMLCanvasElement) => ({
                px: canvas.width,
                css: Math.round(canvas.getBoundingClientRect().width),
                dpr: window.devicePixelRatio,
            }));
        // Растр страницы должен быть плотнее одного пикселя на CSS-пиксель,
        // иначе текст выглядит ступенчатым на экране высокой плотности.
        expect(info.dpr).toBeGreaterThan(1);
        expect(info.px / info.css).toBeGreaterThan(1);
    });
});

test('быстрая серия кликов PDF не рисует промежуточные масштабы', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openPdf(page, 3);
    await setZoom(page, 300);
    // Считаем отрисовки страницы: каждая даёт новую ширину канваса.
    const widths: number[] = [];
    const until = Date.now() + 15000;
    let stop = false;
    const watch = (async () => {
        let last = -1;
        while (!stop && Date.now() < until) {
            const px = await content(page)
                .locator('.page canvas')
                .first()
                .evaluate((canvas: HTMLCanvasElement) => canvas.width);
            if (px !== last) {
                widths.push(px);
                last = px;
            }
            await page.waitForTimeout(40);
        }
    })();
    // Клики без паузы: пользователь жмёт подряд.
    for (let index = 0; index < 8; index += 1) {
        await page.getByRole('button', { name: 'Уменьшить масштаб' }).click();
    }
    await page.waitForTimeout(9000);
    stop = true;
    await watch;
    // Серия — один переход: промежуточные масштабы не отрисовываются.
    expect(widths.length, JSON.stringify(widths)).toBeLessThanOrEqual(2);
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

/** Геометрия первой страницы, её первого слова и видимой области. */
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
test('протяжка с поля страницы не выделяет текст PDF', async ({ page }) => {
    await openPdf(page, 3);
    const geometry = await pageGeometry(page);
    expect(geometry).not.toBeNull();
    // Начало — в поле страницы ниже слов, конец — на слове первой строки.
    await dragInContent(
        page,
        { x: geometry!.page.x + 30, y: geometry!.viewer.bottom - 40 },
        { x: geometry!.word.x + 30, y: geometry!.word.middle },
    );
    expect(await selectedText(page)).toBe('');
});

// Протяжка, уведённая за текст, раньше продолжала выделение по всем следующим
// страницам документа, и выделение становилось областью, а не текстом.
test('протяжка за пределы текста не захватывает соседнюю страницу PDF', async ({ page }) => {
    await openPdf(page, 3);
    const geometry = await pageGeometry(page);
    expect(geometry).not.toBeNull();
    await dragInContent(
        page,
        { x: geometry!.word.x + 2, y: geometry!.word.middle },
        { x: geometry!.word.x + 30, y: geometry!.viewer.bottom - 10 },
    );
    const text = await selectedText(page);
    expect(text).toContain('Page 1');
    expect(text).not.toContain('Page 2');
});

// Ограничение действует только на время протяжки: после неё нативное выделение
// возвращается, и обычные способы выделить текст работают как прежде.
test('после протяжки Ctrl+A выделяет весь документ PDF', async ({ page }) => {
    await openPdf(page, 2);
    const geometry = await pageGeometry(page);
    expect(geometry).not.toBeNull();
    await dragInContent(
        page,
        { x: geometry!.word.x + 2, y: geometry!.word.middle },
        { x: geometry!.word.right - 2, y: geometry!.word.middle },
    );
    expect(await selectedText(page)).toContain('Page 1');
    await page.keyboard.press('Control+a');
    const text = await selectedText(page);
    expect(text).toContain('Page 1');
    expect(text).toContain('Page 2');
});

/**
 * PDF из двух страниц с аннотацией-ссылкой на второй странице.
 *
 * Так выглядит оглавление в настоящих книгах: пункт содержания — не текст, а
 * аннотация `Link` с прямоугольником и целью перехода.
 */
function buildPdfWithLink(): string {
    const objects: string[] = [];
    objects.push('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj');
    objects.push('2 0 obj<</Type/Pages/Kids[3 0 R 5 0 R]/Count 2>>endobj');
    objects.push(
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 7 0 R>>>>/Annots[8 0 R]>>endobj',
    );
    const first = 'BT /F1 24 Tf 72 700 Td (Go to page 2) Tj ET';
    objects.push(`4 0 obj<</Length ${first.length}>>stream\n${first}\nendstream endobj`);
    objects.push(
        '5 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 6 0 R/Resources<</Font<</F1 7 0 R>>>>>>endobj',
    );
    const second = 'BT /F1 24 Tf 72 700 Td (Page 2) Tj ET';
    objects.push(`6 0 obj<</Length ${second.length}>>stream\n${second}\nendstream endobj`);
    objects.push('7 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj');
    objects.push(
        '8 0 obj<</Type/Annot/Subtype/Link/Rect[70 695 320 732]/Border[0 0 0]/Dest[5 0 R/XYZ null null null]>>endobj',
    );
    return `%PDF-1.4\n${objects.join('\n')}\ntrailer<</Root 1 0 R>>\n%%EOF`;
}

test('ссылка оглавления в PDF переводит на нужную страницу', async ({ page }) => {
    const data = Buffer.from(buildPdfWithLink(), 'binary').toString('base64');
    await openPdf(page, 2, false, data);

    // Аннотация превращена в нажимаемый прямоугольник поверх страницы.
    const link = content(page).locator('.page-link');
    await expect(link).toHaveCount(1);
    await link.click();

    // Переход выполнен: страница 2 у верха области чтения.
    await expect(page.getByTestId('reader-page-count')).toBeVisible();
    await expect
        .poll(async () =>
            content(page)
                .locator('.page')
                .first()
                .evaluate((element) => element.getBoundingClientRect().bottom < 0),
        )
        .toBe(true);
});
