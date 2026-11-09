import { expect, test } from '@playwright/test';

import { showLibraryBookList } from './workplace-area';

/** Ответ активной библиотеки для сценариев поиска. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: { active_library: () => active },
    };
  }, ACTIVE_LIBRARY);
});

/**
 * Счётчик найденного — часть поля поиска, а не соседний элемент: он стоит
 * внутри рамки справа, как и лупа слева.
 */
test('счётчик поиска стоит внутри поля в каждом разделе', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  /** Проверка: счётчик внутри того же поля, что и строка ввода. */
  const expectInsideField = async (counterTestId: string, inputSelector: string) => {
    const field = page.locator('[data-search-field]').filter({ has: page.locator(inputSelector) });
    await expect(field).toHaveCount(1);
    await expect(field.getByTestId(counterTestId)).toBeVisible();
  };

  // Рабочие места.
  await page.getByTestId('workspaces-page').waitFor();
  await expectInsideField('workspaces-counter', 'input[placeholder="Поиск рабочего места"]');

  // Библиотеки.
  await page.getByLabel('Библиотека', { exact: true }).click();
  await page
    .getByTestId('library-choose-top')
    .click()
    .catch(() => undefined);
  await page.getByTestId('libraries-page').waitFor();
  await expectInsideField('libraries-filter-counter', 'input[placeholder="Поиск библиотеки"]');

  // Книги.
  await showLibraryBookList(page);
  await expectInsideField('library-counter', 'input[placeholder="Название или автор"]');

  // Заметки.
  await page.getByTestId('nav-notes').click();
  await page.getByTestId('notes-library').waitFor();
  await expectInsideField('notes-filter-counter', 'input[placeholder="Поиск по заметкам"]');
});
