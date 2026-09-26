import { expect, test } from '@playwright/test';

test('снимок оболочки совпадает с эталоном', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Текстура')).toBeVisible();
  await expect(page).toHaveScreenshot('shell.png');
});
