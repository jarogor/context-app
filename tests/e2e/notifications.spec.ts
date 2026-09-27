import { expect, test } from '@playwright/test';

test('уведомления скрывают технические записи и показывают их по переключателю', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Уведомления').click();

  const panel = page.frameLocator('iframe[title="Notifications plugin"]');
  await expect(panel.getByText('Библиотека открыта')).toBeVisible();
  await expect(panel.getByText('Плагин пропущен')).toBeHidden();

  await panel.getByLabel('Технические').click();

  await expect(panel.getByText('Плагин пропущен')).toBeVisible();
  await expect(panel.getByText('Ошибка вызова плагина')).toBeVisible();
  await expect(panel.getByText('WARN')).toBeVisible();
  await expect(panel.getByText('ERROR')).toBeVisible();
});
