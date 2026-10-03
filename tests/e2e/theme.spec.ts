import { expect, test } from '@playwright/test';

/** Открытие страницы настроек. */
async function openSettings(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Настройки').click();
  await expect(page.locator('main').getByRole('heading', { name: 'Общие' })).toBeVisible();
  return page.locator('main');
}

test('выбор тёмной темы переключает оформление интерфейса', async ({ page }) => {
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
