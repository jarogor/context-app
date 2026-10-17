import { expect, test } from '@playwright/test';

/** Открытие страницы настроек. */
async function openSettings(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Настройки', { exact: true }).click();
  await expect(page.locator('main').getByTestId('settings-group-heading').first()).toBeVisible();
  return page.locator('main');
}

/** Выбор значения в выпадающем списке настроек по его подписи. */
async function chooseSelect(page: import('@playwright/test').Page, label: string, option: string) {
  await page.locator('main').getByRole('button', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

/** Выбор значения поля и сохранение единой кнопкой страницы настроек. */
async function chooseAndSave(page: import('@playwright/test').Page, label: string, option: string) {
  await chooseSelect(page, label, option);
  await page.getByTestId('settings-page').getByRole('button', { name: 'Сохранить' }).click();
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
  await openSettings(page);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const background = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);

  await chooseAndSave(page, 'Тема оформления', 'Тёмная');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(async () =>
      page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(background);
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
});

test('выбор палитры в настройках меняет цвета интерфейса', async ({ page }) => {
  await openSettings(page);

  await expect(page.locator('html')).toHaveAttribute('data-palette', 'linen');
  const background = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);

  await chooseAndSave(page, 'Палитра оформления', 'Кобальт');

  await expect(page.locator('html')).toHaveAttribute('data-palette', 'cobalt');
  await expect
    .poll(async () =>
      page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(background);
});
