import { expect, test } from '@playwright/test';

/** Оформленная библиотека в истории: название, описание, иконка и цвет. */
const DECORATED_LIBRARY = {
  path: '/demo-library',
  provider: 'books-source',
  provider_name: 'books-source',
  added_at_millis: 1_700_000_000_000,
  available: true,
  name: 'Домашняя',
  description: 'Книги для чтения вечером.',
  icon: 'star',
  color: 'blue',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => null,
        library_history_list: () => ({ entries: [entry] }),
      },
    };
  }, DECORATED_LIBRARY);
});

/** Открытие страницы библиотек с выбранной записью. */
async function showLibraryCard(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Книги', exact: true }).click();
  await page.getByTestId('library-item').first().getByRole('button').first().click();
  await expect(page.getByTestId('library-card-open')).toBeVisible();
}

test('шапка карточки ловит нажатие в любое место, а не только по тексту', async ({ page }) => {
  await showLibraryCard(page);

  const head = await page.getByTestId('library-card-open').boundingBox();
  expect(head).not.toBeNull();
  // Угол шапки далеко от названия и описания: целиться в текст не нужно.
  await page.mouse.click(head!.x + head!.width - 30, head!.y + head!.height - 16);

  await expect(page.getByTestId('libraries-page')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();
});

test('меню карточки стоит в верхнем правом углу шапки', async ({ page }) => {
  await showLibraryCard(page);

  const gaps = await page.evaluate(() => {
    const head = document.querySelector('[data-testid="library-card-open"]')?.parentElement;
    const menu = document.querySelector(
      '[data-testid="library-card"] button[aria-label="Действия с библиотекой"]',
    );
    if (!head || !menu) {
      return null;
    }
    const headBox = head.getBoundingClientRect();
    const menuBox = menu.getBoundingClientRect();
    return {
      top: Math.round(menuBox.top - headBox.top),
      right: Math.round(headBox.right - menuBox.right),
      height: Math.round(headBox.height),
    };
  });

  expect(gaps).not.toBeNull();
  // Меню — у верхнего правого края, а не по центру текста: отступы сверху и
  // справа равны, и меню не сдвигается к описанию, каким бы длинным оно ни было.
  expect(Math.abs(gaps!.top - gaps!.right)).toBeLessThanOrEqual(2);
  expect(gaps!.top).toBeLessThanOrEqual(20);
  // Шапка — удобная цель нажатия даже с одним названием.
  expect(gaps!.height).toBeGreaterThanOrEqual(60);
});
