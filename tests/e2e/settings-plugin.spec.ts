import { expect, test } from '@playwright/test';

test('страница настроек внутри iframe рендерит секции', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки').click();

  const settings = page.frameLocator('iframe[title="Settings plugin"]');
  await expect(settings.getByRole('heading', { name: 'Общие' })).toBeVisible();
  await expect(settings.getByText('Приветственное уведомление')).toBeVisible();
});
