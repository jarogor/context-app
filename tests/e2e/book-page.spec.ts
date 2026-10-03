import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев страницы книги. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'library' };

test.beforeEach(async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: { active_library: () => active },
            };
    }, ACTIVE_LIBRARY);
});

/** Переход к основному разделу библиотеки, если открыто рабочее место. */
async function showLibrary(page: import('@playwright/test').Page) {
    const workspace = page.getByLabel('Рабочее место', { exact: true });
    if ((await workspace.getAttribute('aria-pressed')) === 'true') {
        await workspace.click();
    }
}

test('клик по книге открывает страницу книги с информацией', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByRole('button', { name: /Демо-книга/ }).click();

    await expect(library.getByTestId('book-title')).toHaveText('Демо-книга');
    await expect(library.getByTestId('book-page').getByText('Тестовый автор')).toBeVisible();
});

test('страница книги предлагает чтение и открытие в системе', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByRole('button', { name: /Демо-книга/ }).click();

    await expect(library.getByRole('button', { name: 'Открыть в рабочем месте' })).toBeVisible();
    await expect(library.getByRole('button', { name: 'Открыть в системе' })).toBeVisible();
});

test('для неподдерживаемого формата нет кнопки открытия в рабочем месте', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByRole('button', { name: /Вторая книга/ }).click();

    await expect(library.getByTestId('book-title')).toHaveText('Вторая книга');
    await expect(library.getByRole('button', { name: 'Открыть в рабочем месте' })).toHaveCount(0);
    await expect(library.getByRole('button', { name: 'Открыть в системе' })).toBeVisible();
});

test('возврат к списку сохраняет поиск', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByPlaceholder('Название или автор').fill('Демо');
    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await library.getByRole('button', { name: /К списку/ }).click();

    await expect(library.getByPlaceholder('Название или автор')).toHaveValue('Демо');
    await expect(library.getByText('Вторая книга')).toBeHidden();
});
