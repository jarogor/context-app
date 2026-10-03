import { expect, test } from '@playwright/test';

test('уведомления скрывают технические записи и показывают их по переключателю', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Уведомления').click();

  await expect(page.getByText('Библиотека открыта')).toBeVisible();
  await expect(page.getByText('Плагин пропущен')).toBeHidden();

  await page.getByLabel('Технические').click();

  await expect(page.getByText('Плагин пропущен')).toBeVisible();
  await expect(page.getByText('Ошибка вызова плагина')).toBeVisible();
  await expect(page.getByText('WARN')).toBeVisible();
  await expect(page.getByText('ERROR')).toBeVisible();
});
