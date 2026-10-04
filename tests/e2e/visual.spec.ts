import { expect, test } from '@playwright/test';

test('снимок оболочки совпадает с эталоном', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Текстура')).toBeVisible();
  await expect(page).toHaveScreenshot('shell.png');
});

test('снимок тёмной темы совпадает с эталоном', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки').click();

  const settings = page.locator('main');
  await expect(settings.getByRole('heading', { name: 'Общие' })).toBeVisible();
  await settings.getByRole('button', { name: 'Тема оформления' }).click();
  await page.getByRole('option', { name: 'Тёмная' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await expect(page).toHaveScreenshot('shell-dark.png');
});
