import { expect, test } from '@playwright/test';

import { showLibraryBookList } from './workplace-area';

/** Ответ активной библиотеки для сценариев адаптивности. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: { active_library: () => active },
            };
    }, ACTIVE_LIBRARY);
});

/** Горизонтальная прокрутка документа: её быть не должно ни на одной ширине. */
async function hasHorizontalScroll(page: import('@playwright/test').Page): Promise<boolean> {
    return page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
}

/** Контрольные ширины: очень узкий телефон, компактный, распространённый, планшет. */
const WIDTHS = [320, 360, 390, 414, 768];

test('на узком окне разделы остаются в верхней панели кнопками-иконками', async ({ page }) => {
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/');

        const nav = page.getByTestId('section-nav');
        await expect(nav).toBeVisible();
        // Меню разделов живёт в верхней панели на любой ширине; на узком окне
        // (телефон и планшет, до `--breakpoint-narrow`) — без подписей, иконками.
        const bar = page.getByTestId('app-bar');
        const navBox = await nav.boundingBox();
        const barBox = await bar.boundingBox();
        expect(navBox).not.toBeNull();
        expect(barBox).not.toBeNull();
        expect(navBox!.y).toBeGreaterThanOrEqual(barBox!.y);
        expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(barBox!.y + barBox!.height + 1);
        await expect(nav).toHaveAttribute('data-mobile', width < 900 ? 'true' : 'false');

        // Разделы и служебные действия доступны на любой ширине.
        for (const label of [
            'Рабочее место',
            'Библиотека',
            'Заметки',
            'Уведомления',
            'Настройки',
        ]) {
            await expect(page.getByLabel(label, { exact: true }).first()).toBeVisible();
        }
    }
});

test('на телефоне рабочее место занимает всю ширину окна', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');

    const area = await page.getByTestId('workplace-area').boundingBox();
    expect(area).not.toBeNull();
    // Верхняя панель не делит ширину с содержимым: оно на всю ширину окна.
    expect(Math.abs(area!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(area!.width - 320)).toBeLessThanOrEqual(1);
});

test('все основные экраны без горизонтальной прокрутки на узких ширинах', async ({ page }) => {
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/');
        await expect(page.getByTestId('workspaces-page')).toBeVisible();
        expect(await hasHorizontalScroll(page), `рабочие места ${width}`).toBe(false);

        await showLibraryBookList(page);
        expect(await hasHorizontalScroll(page), `библиотека ${width}`).toBe(false);

        await page.getByTestId('nav-notes').click();
        await expect(page.getByTestId('notes-library')).toBeVisible();
        expect(await hasHorizontalScroll(page), `заметки ${width}`).toBe(false);

        await page.getByTestId('nav-settings').click();
        await expect(page.getByTestId('settings-page')).toBeVisible();
        expect(await hasHorizontalScroll(page), `настройки ${width}`).toBe(false);
    }
});

test('меню разделов настроек на телефоне — полоса сверху, на десктопе — колонка', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await page.getByTestId('nav-settings').click();

    const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
    const narrow = await menu.boundingBox();
    const page390 = 390;
    expect(narrow).not.toBeNull();
    // На телефоне меню занимает всю ширину области: это полоса, а не колонка.
    expect(narrow!.width).toBeGreaterThan(page390 * 0.6);

    await page.setViewportSize({ width: 1440, height: 800 });
    const wide = await menu.boundingBox();
    expect(wide).not.toBeNull();
    // На десктопе меню — узкая колонка слева.
    expect(wide!.width).toBeLessThan(page390);
});

test('панель заметок на телефоне закрывается кнопкой', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await showLibraryBookList(page);
    const library = page.locator('main');
    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await library.getByRole('button', { name: /Читать/ }).click();
    const picker = page.getByTestId('workspace-picker-item');
    if (await picker.count()) {
        await picker.first().click();
    }
    await expect(page.getByTestId('workplace-tabs')).toBeVisible();

    await page.getByTestId('workplace-notes-toggle').click();
    const panel = page.getByTestId('notes-panel');
    await expect(panel).toBeVisible();

    // Панель перекрывает содержимое, поэтому закрывается явной кнопкой.
    await expect(panel.getByTestId('side-panel-close')).toBeVisible();
    await panel.getByTestId('side-panel-close').click();
    await expect(panel).toBeHidden();
});

test('горизонтальная ориентация телефона остаётся рабочей', async ({ page }) => {
    // Низкая высота при узкой ширине: содержимое прокручивается, навигация видна.
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto('/');
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    await expect(page.getByTestId('nav-notes')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
});
