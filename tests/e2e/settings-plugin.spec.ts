import { expect, test } from '@playwright/test';

import { bottomReachable } from './scroll';

test('в узком окне раздел настроек прокручивается до нижнего края', async ({ page }) => {
  // Малая высота окна: содержимое настроек выше области, нижний край должен
  // быть достижим прокруткой, а не обрезан.
  await page.setViewportSize({ width: 900, height: 260 });
  await page.goto('/');
  await page.getByLabel('Настройки').click();
  await page.getByTestId('settings-section').first().waitFor();

  const result = await bottomReachable(page, '[data-testid="settings-section"]');
  expect(result.reason ?? '').toBe('');
  expect(result.ok).toBe(true);
  expect(result.scrollTop!).toBeGreaterThan(0);
  expect(result.lastBottom!).toBeLessThanOrEqual(result.scrollerBottom! + 1);
});

test('прокрутка настроек не даёт горизонтальной прокрутки документа', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 260 });
  await page.goto('/');
  await page.getByLabel('Настройки').click();
  await page.getByTestId('settings-section').first().waitFor();

  await bottomReachable(page, '[data-testid="settings-section"]');

  const noHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(noHorizontalScroll).toBe(true);
});

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
