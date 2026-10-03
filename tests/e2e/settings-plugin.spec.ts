import { expect, test } from '@playwright/test';

test('страница настроек рендерит секции и поля', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки').click();

  const settings = page.locator('main');
  await expect(settings.getByRole('heading', { name: 'Общие' })).toBeVisible();
  await expect(settings.getByText('Приветственное уведомление')).toBeVisible();
  await expect(settings.getByText('Порог технических логов')).toBeVisible();
});

test('дискретное поле настроек переключается', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки').click();

  const checkbox = page.locator('main [role="checkbox"]').first();
  await expect(checkbox).toBeChecked();

  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
});

test('раздел «Информация» показывает версию и расположение конфигов', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await menu.getByRole('button', { name: 'Информация' }).click();

  await expect(page.getByText('версия 0.1.0')).toBeVisible();
  await expect(page.getByText('Расположение конфигов и кешей')).toBeVisible();
  await expect(page.getByText('/home/user/.texture/app-state', { exact: true })).toBeVisible();
  await expect(page.getByText('Кэш компиляции WASM')).toBeVisible();
});
