import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценария. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

/**
 * Выбор библиотеки: пока ядро не ответило, карточка показывает прогресс, а не
 * «Загружена» с заблокированной кнопкой перехода к книгам.
 */
test('выбор библиотеки показывает прогресс, а не заблокированные сведения', async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => active,
        // Выбор библиотеки не завершается: интерфейс должен показать прогресс.
        select_source_library: () => new Promise(() => {}),
      },
    };
  }, ACTIVE_LIBRARY);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByLabel('Книги', { exact: true }).click();

  // Переход к списку библиотек из полосы книг.
  await page.getByTestId('library-choose-top').click();
  const page_ = page.getByTestId('libraries-page');
  await expect(page_).toBeVisible();

  // Выбор записи в списке.
  const item = page_.getByTestId('library-item').filter({ hasText: 'demo-library' }).first();
  const open = item.getByRole('button').first();
  await open.click();

  // Пока загрузка идёт, карточка показывает прогресс; сведений и перехода нет.
  await expect(page_.getByTestId('library-card-progress')).toBeVisible();
  await expect(page_.getByTestId('library-card-open')).toHaveCount(0);

  // Список не заблокирован: курсор обычный, а не «запрещено».
  const cursor = await open.evaluate((element) => getComputedStyle(element).cursor);
  expect(cursor).not.toBe('not-allowed');
});
