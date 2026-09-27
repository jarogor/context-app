import { expect, test } from '@playwright/test';

test('стор показывает перечень плагинов и активность', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await menu.getByRole('button', { name: 'Плагины' }).click();

  const store = page.frameLocator('iframe[title="Plugin store"]');
  await expect(store.getByText('calibre', { exact: true })).toBeVisible();
  await expect(store.getByText('demo', { exact: true })).toBeVisible();

  // Отключаемый пользовательский плагин можно удалить, поставляемый — нет.
  await expect(store.getByRole('button', { name: 'Удалить' })).toHaveCount(1);
});
