import { expect, test } from '@playwright/test';

test('стор показывает перечень плагинов и активность', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки', { exact: true }).click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await menu.getByRole('button', { name: 'Система' }).click();

  const store = page.locator('main');
  await expect(store.getByText('books-source-calibre', { exact: true })).toBeVisible();
  await expect(store.getByText('installed-plugin', { exact: true })).toBeVisible();
  // Все плагины — одним списком, без деления на виды и «образцы».
  await expect(store.getByTestId('store-plugins').locator('li')).toHaveCount(2);

  // Отключаемый пользовательский плагин можно удалить, поставляемый — нет.
  await expect(store.getByRole('button', { name: 'Удалить' })).toHaveCount(1);
});
