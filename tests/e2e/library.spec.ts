import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев библиотечного UI. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'library' };

test.beforeEach(async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: { active_library: () => active },
            };
    }, ACTIVE_LIBRARY);
});

test('библиотека показывает книги, поиск и обложки', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Рабочее место', { exact: true }).click();
    const library = page.locator('main');

    await expect(library.getByText('Демо-книга')).toBeVisible();
    await expect(library.getByText('Вторая книга')).toBeVisible();
    await expect(library.getByText('Тестовый автор')).toBeVisible();

    // Обложка одной книги извлечена, у другой — заглушка.
    await expect(library.locator('img')).toHaveCount(1);
    await expect(library.locator('svg')).not.toHaveCount(0);
});

test('поиск фильтрует список и показывает пустое состояние', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Рабочее место', { exact: true }).click();
    const library = page.locator('main');
    const search = library.getByPlaceholder('Название или автор');

    await search.fill('Вторая');
    await expect(library.getByText('Вторая книга')).toBeVisible();
    await expect(library.getByText('Демо-книга')).toBeHidden();

    await search.fill('нет такой книги');
    await expect(library.getByText('В библиотеке пока нет книг.')).toBeVisible();
});
