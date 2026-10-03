import { expect, test } from '@playwright/test';

test('стор показывает перечень плагинов и активность', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await menu.getByRole('button', { name: 'Плагины' }).click();

  const store = page.locator('main');
  await expect(store.getByText('calibre', { exact: true })).toBeVisible();
  await expect(store.getByText('installed-plugin', { exact: true })).toBeVisible();
  // Рабочие плагины и образцы для разработчика разделены.
  await expect(store.getByText('Образцы для разработчика (2)')).toBeVisible();

  // Отключаемый пользовательский плагин можно удалить, поставляемый — нет.
  await expect(store.getByRole('button', { name: 'Удалить' })).toHaveCount(1);
});
