import { expect, test } from '@playwright/test';

/** Открытие страницы настроек. */
async function openSettings(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Настройки').click();
  await expect(page.locator('main').getByRole('heading', { name: 'Общие' })).toBeVisible();
  return page.locator('main');
}

test('кнопка в шапке циклически переключает тему', async ({ page }) => {
  await page.goto('/');

  // Исходно системная тема; в тесте ОС светлая.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // Цикл: светлая → тёмная → системная.
  await page.getByLabel('Переключить тему', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByLabel('Переключить тему', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');

  await page.getByLabel('Переключить тему', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('выбор тёмной темы в настройках переключает оформление', async ({ page }) => {
  const settings = await openSettings(page);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const surface = await page
    .locator('header')
    .evaluate((element) => getComputedStyle(element).backgroundColor);

  await settings.getByLabel('Тема оформления').selectOption('dark');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(async () =>
      page.locator('header').evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(surface);
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
});

test('выбор палитры в настройках меняет цвета интерфейса', async ({ page }) => {
  const settings = await openSettings(page);

  await expect(page.locator('html')).toHaveAttribute('data-palette', 'gruvbox');
  const surface = await page
    .locator('header')
    .evaluate((element) => getComputedStyle(element).backgroundColor);

  await settings.getByLabel('Палитра оформления').selectOption('mist');

  await expect(page.locator('html')).toHaveAttribute('data-palette', 'mist');
  await expect
    .poll(async () =>
      page.locator('header').evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(surface);
});
