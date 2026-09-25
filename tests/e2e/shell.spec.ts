import { expect, test } from '@playwright/test';

test('оболочка показывает панель и переключает настройки', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('BookLib')).toBeVisible();
  await expect(page.getByText('Библиотека')).toBeVisible();

  await page.getByLabel('Настройки').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await expect(menu.getByRole('button', { name: 'Настройки' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Плагины' })).toBeVisible();

  await menu.getByRole('button', { name: 'Плагины' }).click();
  const store = page.frameLocator('iframe[title="Plugin store"]');
  await expect(store.getByText('Установленные плагины')).toBeVisible();
});
