import { expect, test, type Page } from '@playwright/test';
import { mockFlowingBook } from './plugin-viewer';
import { openWorkspaceArea } from './workplace-area';

/** Главы EPUB со сноской: разметка `epub:type` и ссылка в файл сносок. */
const CHAPTERS = [
    {
        title: 'Глава 1',
        html: [
            '<h2>Глава 1</h2>',
            '<p>Текст с размеченной сноской<a epub:type="noteref" href="#fn1">1</a>',
            ' и сноской без разметки<a href="notes.xhtml#fn2">2</a>.</p>',
        ].join(''),
    },
    {
        title: 'Сноски',
        html: [
            '<section epub:type="endnotes">',
            '<aside id="fn1" epub:type="footnote"><p>Первая сноска EPUB.</p></aside>',
            '<aside id="fn2"><p>Вторая сноска EPUB.</p></aside>',
            '</section>',
        ].join(''),
    },
];

/** Установка мока: книга текучего формата, нарисованная плагином. */
async function installMock(page: Page) {
    await mockFlowingBook(page, 'epub', CHAPTERS);
}

/** Область содержимого книги. */
function content(page: Page) {
    return page.frameLocator('iframe[title="Содержимое книги"]');
}

/** Открытие книги EPUB вкладкой рабочего места. */
async function openBook(page: Page) {
    await page.goto('/');
    await openWorkspaceArea(page);
    const list = page.getByTestId('workspaces-page');
    if (await list.isVisible().catch(() => false)) {
        const open = page.getByTestId('workspace-open').first();
        if (await open.isVisible().catch(() => false)) {
            await open.click();
        }
    }
    await page.getByRole('button', { name: /Добавить книгу/ }).click();
    const library = page.locator('main');
    const back = library.getByRole('button', { name: /К списку книг/ });
    if ((await back.count()) > 0) {
        await back.click();
    }
    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await library.getByRole('button', { name: /Читать/ }).click();
    const picker = page.getByTestId('workspace-picker-item');
    if (await picker.count()) {
        await picker.first().click();
    }
    await expect(content(page).locator('h2').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
    await installMock(page);
});

// Книги EPUB размечают сноски по-разному: `epub:type`, роли ARIA или только
// ссылкой в отдельный файл сносок. Все эти случаи должны открывать меню.
test('меню сноски EPUB по разметке epub:type', async ({ page }) => {
    await openBook(page);

    await content(page).locator('a[epub\\:type="noteref"]').click();

    const menu = page.getByTestId('footnote-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId('footnote-text')).toContainText('Первая сноска EPUB.');
    // В меню попадает одна сноска, а не вся группа сносок.
    await expect(menu.getByTestId('footnote-text')).not.toContainText('Вторая сноска EPUB.');
});

test('меню сноски EPUB без разметки: ссылка в файл сносок', async ({ page }) => {
    await openBook(page);

    await content(page).locator('a[href="notes.xhtml#fn2"]').click();

    const menu = page.getByTestId('footnote-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId('footnote-text')).toContainText('Вторая сноска EPUB.');
});

test('сноска EPUB без epub:type: пара ссылок с обратным переходом', async ({ page }) => {
    // Реальное оформление книги: маркер цифрой в тексте и ссылка «↩» в сноске,
    // никаких `epub:type` и `role` — сноску выдаёт только эта пара ссылок.
    await page.addInitScript(() => {
        const target = window as unknown as {
            __TEXTURE_MOCK_OVERRIDES__?: { handlers?: Record<string, unknown> };
        };
        const overrides = target.__TEXTURE_MOCK_OVERRIDES__ ?? {};
        overrides.handlers = {
            ...(overrides.handlers ?? {}),
            reader_content: () => ({
                title: 'Книга',
                authors: [],
                chapters: [
                    {
                        title: 'Глава 1',
                        html: '<h2>Глава 1</h2><p>Текст<a id="ref1" href="#n1"><sup>1</sup></a>.</p>',
                    },
                    {
                        title: 'Сноски',
                        html: '<div class="notes"><p><a id="n1" href="#ref1">↩</a> Текст сноски без разметки.</p></div>',
                    },
                ],
            }),
        };
        target.__TEXTURE_MOCK_OVERRIDES__ = overrides;
    });
    await page.goto('/');
    await openWorkspaceArea(page);
    const list = page.getByTestId('workspaces-page');
    if (await list.isVisible().catch(() => false)) {
        const open = page.getByTestId('workspace-open').first();
        if (await open.isVisible().catch(() => false)) {
            await open.click();
        }
    }
    await page.getByRole('button', { name: /Добавить книгу/ }).click();
    const library = page.locator('main');
    const back = library.getByRole('button', { name: /К списку книг/ });
    if ((await back.count()) > 0) {
        await back.click();
    }
    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await library.getByRole('button', { name: /Читать/ }).click();
    const picker = page.getByTestId('workspace-picker-item');
    if (await picker.count()) {
        await picker.first().click();
    }

    await content(page).locator('a#ref1').click();

    const menu = page.getByTestId('footnote-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId('footnote-text')).toContainText('Текст сноски без разметки.');
    // Издательский возврат уже стоит: второй читалка не добавляет.
    await expect(content(page).locator('.context-footnote-back')).toHaveCount(0);
    // Переход к сноске уводит книгу, а ссылка «↩» издателя возвращает назад.
    await menu.getByTestId('footnote-goto').click();
    await content(page).locator('a#n1').click();
    await expect
        .poll(async () =>
            content(page)
                .locator('a#ref1')
                .evaluate((element) => Math.abs(Math.round(element.getBoundingClientRect().top))),
        )
        .toBeLessThan(400);
});

test('возврат к месту ссылки есть у каждой сноски книги', async ({ page }) => {
    await openBook(page);

    // Ссылки возврата добавлены в сами сноски, а не показываются кнопкой.
    await expect(content(page).locator('.context-footnote-back')).toHaveCount(2);

    await page.getByRole('button', { name: 'Тёмная тема области чтения' }).first().click().catch(() => undefined);
    await content(page).locator('.context-footnote-back').first().click();

    // Возврат встаёт на маркер первой сноски.
    await expect
        .poll(async () =>
            content(page)
                .locator('a[epub\\:type="noteref"]')
                .evaluate((element) => Math.abs(Math.round(element.getBoundingClientRect().top))),
        )
        .toBeLessThan(500);
});

test('меню сноски меняет оформление вместе с темой области чтения', async ({ page }) => {
    await openBook(page);

    /** Фон и цвет текста меню, открытого на текущей теме чтения. */
    async function menuColors() {
        await content(page).locator('a[epub\\:type="noteref"]').click();
        const menu = page.getByTestId('footnote-menu');
        await expect(menu).toBeVisible();
        const colors = await menu.evaluate((element) => {
            const style = getComputedStyle(element);
            return { background: style.backgroundColor, color: style.color };
        });
        await page.getByTestId('footnote-menu').getByRole('button', { name: 'Закрыть' }).click();
        await expect(menu).toHaveCount(0);
        return colors;
    }

    const light = await menuColors();

    // Тема области чтения переключается в панели чтения.
    await page
        .getByTestId('reader-theme-toggle')
        .getByRole('button', { name: 'Тёмная тема области чтения' })
        .click();
    await expect(content(page).locator('html')).toHaveAttribute('data-reader-theme', 'dark');

    const dark = await menuColors();

    // Меню относится к книге: фон и текст следуют стороне темы чтения, а не
    // теме интерфейса.
    expect(dark.background).not.toBe(light.background);
    expect(dark.color).not.toBe(light.color);
});
