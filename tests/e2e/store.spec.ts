import { expect, test } from '@playwright/test';

/**
 * Раздел «Система»: обновления и плагины.
 *
 * Проверяется главное разделение страницы: обновления приложения и обновления
 * плагинов — разные вещи и стоят отдельно; установленные плагины и источники
 * обновлений — тоже. Раньше всё это шло одной кучей, и было непонятно, к чему
 * относится кнопка и откуда приходят обновления.
 */

test('обновления приложения, плагинов и источники разведены по разделам', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки', { exact: true }).click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await menu.getByRole('button', { name: 'Система' }).click();

  const store = page.getByTestId('store-page');

  // Обновление приложения — свой раздел, плагины — свой.
  await expect(store.getByText('Приложение', { exact: true })).toBeVisible();
  await expect(store.getByText('Плагины', { exact: true })).toBeVisible();
  // В каждом разделе своя подпись «Источник»: чей он — ясно из раздела.
  await expect(store.getByText('Источник', { exact: true })).toHaveCount(2);

  // У приложения и у плагинов — разные источники по умолчанию.
  await expect(store.getByTestId('store-app-source')).toHaveText('/home/user/.context/updates');
  // У плагинов свой источник по умолчанию, отличный от адреса приложения.
  await expect(store.getByTestId('store-plugin-source')).toHaveText(
    '/home/user/.context/plugin-updates',
  );
});

test('стор показывает перечень плагинов и активность', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки', { exact: true }).click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await menu.getByRole('button', { name: 'Система' }).click();

  const store = page.getByTestId('store-page');
  await expect(store.getByText('books-source-calibre', { exact: true })).toBeVisible();
  await expect(store.getByText('installed-plugin', { exact: true })).toBeVisible();
  // Все плагины — одним списком, без деления на виды и «образцы».
  await expect(store.getByTestId('store-plugins').locator('li')).toHaveCount(2);

  // Отключаемый пользовательский плагин можно удалить, поставляемый — нет.
  await expect(store.getByRole('button', { name: 'Удалить' })).toHaveCount(1);
});
