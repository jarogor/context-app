import { expect, test } from '@playwright/test';

import { bottomReachable } from './scroll';
import { showLibraryBookList } from './workplace-area';

/** Ответ активной библиотеки для сценариев библиотечного UI. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: { active_library: () => active },
            };
    }, ACTIVE_LIBRARY);
});

test('в узком окне список книг прокручивается до нижнего края', async ({ page }) => {
    // Малая высота окна: карточки книг выше области. Нижний край списка должен
    // быть достижим прокруткой, а не обрезан.
    await page.setViewportSize({ width: 700, height: 260 });
    await page.goto('/');
    await showLibraryBookList(page);
    const library = page.locator('main');
    await library.getByText('Демо-книга').waitFor();

    const result = await bottomReachable(page, '[data-testid="library-page"]');
    expect(result.reason ?? '').toBe('');
    expect(result.ok).toBe(true);
    expect(result.scrollTop!).toBeGreaterThan(0);
    expect(result.lastBottom!).toBeLessThanOrEqual(result.scrollerBottom! + 1);
});

test('библиотека показывает книги, поиск и обложки', async ({ page }) => {
    await page.goto('/');
    await showLibraryBookList(page);
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
    await showLibraryBookList(page);
    const library = page.locator('main');
    const search = library.getByPlaceholder('Название или автор');

    await search.fill('Вторая');
    await expect(library.getByText('Вторая книга')).toBeVisible();
    await expect(library.getByText('Демо-книга')).toBeHidden();

    await search.fill('нет такой книги');
    await expect(library.getByTestId('library-empty')).toBeVisible();
});

test('шапка показывает имя открытой библиотеки', async ({ page }) => {
    await page.goto('/');
    await showLibraryBookList(page);

    // Навигационный текст в шапке: раздел и имя открытой библиотеки.
    await expect(page.getByTestId('app-context')).toContainText('Библиотека · demo-library');
});
