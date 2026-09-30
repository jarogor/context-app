import { expect, test } from '@playwright/test';

/** Закрытие поверхности рабочего места, чтобы показать основной раздел библиотеки. */
async function showLibrary(page: import('@playwright/test').Page) {
    const workspace = page.getByLabel('Рабочее место', { exact: true });
    if ((await workspace.getAttribute('aria-pressed')) === 'true') {
        await workspace.click();
    }
}

test('оболочка показывает панель и переключает настройки', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Текстура')).toBeVisible();
    await expect(page.getByTestId('workplace-surface')).toBeVisible();

    await page.getByLabel('Настройки').click();

    const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
    await expect(menu.getByRole('button', { name: 'Настройки' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Плагины' })).toBeVisible();

    await menu.getByRole('button', { name: 'Плагины' }).click();
    const store = page.frameLocator('iframe[title="Plugin store"]');
    await expect(store.getByRole('heading', { name: 'Плагины' })).toBeVisible();
});

test('кнопки верхней панели показывают активный раздел', async ({ page }) => {
    await page.goto('/');

    const libraries = page.getByLabel('Библиотеки');
    const workspace = page.getByLabel('Рабочее место', { exact: true });
    const settings = page.getByLabel('Настройки');

    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
    await expect(libraries).toHaveAttribute('aria-pressed', 'false');
    await expect(settings).toHaveAttribute('aria-pressed', 'false');

    await libraries.click();
    await expect(libraries).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace).toHaveAttribute('aria-pressed', 'false');

    await workspace.click();
    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
    await expect(libraries).toHaveAttribute('aria-pressed', 'false');

    await settings.click();
    await expect(settings).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace).toHaveAttribute('aria-pressed', 'false');
});

test('при запуске открыт список рабочих мест', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByLabel('Рабочее место', { exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(page.getByTestId('workplace-surface')).toBeVisible();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('страница библиотек показывает историю с временем', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Библиотеки').click();

    await expect(page.getByRole('heading', { name: 'Библиотеки' })).toBeVisible();
    const entry = page.getByRole('button', { name: /demo-library/ });
    await expect(entry).toBeVisible();
    await expect(page.getByText('library', { exact: true })).toBeVisible();
    await expect(entry).toContainText('2023');
});

test('после открытия библиотеки страница выбора закрывается', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Библиотеки').click();
    await page.getByRole('button', { name: /demo-library/ }).click();

    await expect(page.getByRole('heading', { name: 'Библиотеки' })).toBeHidden();
    await expect(page.frameLocator('iframe[title="Library plugin"]').locator('body')).toBeVisible();
});

test('основной раздел библиотеки возвращается после закрытия рабочего места', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);

    await expect(page.frameLocator('iframe[title="Library plugin"]').locator('body')).toBeVisible();
});
