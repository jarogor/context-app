import { expect, test, type Page } from '@playwright/test';
import { openWorkspaceArea } from './workplace-area';
import { mockFlowingBook } from './plugin-viewer';

/** Главы книги для панели содержания. */
const CHAPTERS = [
    { title: 'Введение', html: '<h1>Введение</h1><p>Первый абзац книги.</p>' },
    { title: 'Первая глава', html: '<h1>Первая глава</h1>' + '<p>Текст главы.</p>'.repeat(200) },
    { title: 'Вторая глава', html: '<h1>Вторая глава</h1><p>Ещё текст.</p>' },
];

test.beforeEach(async ({ page }) => {
    // Книга нарисована плагином формата: главы для панели содержания приходят
    // из содержимого, который разобрал плагин.
    await mockFlowingBook(page, 'epub', CHAPTERS);
});


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
}

/** Область содержимого книги. */
function content(page: Page) {
    return page.frameLocator('iframe[title="Содержимое книги"]');
}

test('панель содержания EPUB: главы книги и переход к главе', async ({ page }) => {
    await openBook(page);
    await expect(content(page).getByText('Первый абзац книги.')).toBeVisible();

    await page.getByTestId('workplace-properties-toggle').click();
    const panel = page.getByTestId('properties-panel');
    await expect(panel).toBeVisible();

    // Содержание текучей книги — её главы; у страничных вкладок его не было бы.
    const rows = panel.getByTestId('properties-content-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('Введение');

    /** Текущее положение прокрутки документа книги. */
    const scrollTop = () =>
        content(page)
            .locator('html')
            .evaluate(() => (document.scrollingElement ?? document.documentElement).scrollTop);

    // Переход вниз прокручивает книгу к разделу третьей главы: вторая глава
    // длинная, поэтому её начало уже не помещается на первом экране.
    await rows.nth(2).click();
    await expect.poll(scrollTop).toBeGreaterThan(0);
    const down = await scrollTop();

    // Переход вверх возвращает книгу к началу. Раньше прокрутка прибавлялась к
    // текущей позиции, и книга уезжала только вниз, упираясь в конец.
    await rows.first().click();
    await expect.poll(scrollTop).toBeLessThan(down);
    expect(await scrollTop()).toBeLessThan(120);
});

test('панель свойств EPUB не показывает чужие вкладки', async ({ page }) => {
    await openBook(page);
    await expect(content(page).getByText('Первый абзац книги.')).toBeVisible();

    await page.getByTestId('workplace-properties-toggle').click();
    const panel = page.getByTestId('properties-panel');
    // У текучей книги нет закладок файла, превью страниц и пометок PDF.
    await expect(panel.getByTestId('properties-tab-contents')).toBeVisible();
    await expect(panel.getByTestId('properties-tab-bookmarks')).toHaveCount(0);
    await expect(panel.getByTestId('properties-tab-pages')).toHaveCount(0);
    await expect(panel.getByTestId('properties-tab-annotations')).toHaveCount(0);
});
