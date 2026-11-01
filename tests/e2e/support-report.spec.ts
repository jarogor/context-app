import { expect, test } from '@playwright/test';

/**
 * Логи приложения.
 *
 * Проверяется: журнал виден в сведениях о приложении как обычный пункт
 * расположения данных, открывается папкой и выгружается одним нажатием.
 */

test('логи экспортируются одним действием', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  await page.getByRole('navigation', { name: 'Разделы настроек' })
    .getByRole('button', { name: 'Система' })
    .click();

  // Логи — пункт расположения данных в сведениях о приложении.
  const report = page.getByTestId('app-path-diagnostics');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Логи');
  await expect(report).toContainText('diagnostics.log');

  await report.getByRole('button', { name: 'Экспорт' }).click();
  // Мок-мост возвращает путь сохранённого файла.
  await expect(page.getByTestId('support-report-saved')).toContainText('context-report');
});

test('журнал не настраивается: пользователю нечего в нём решать', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  await page.getByRole('navigation', { name: 'Разделы настроек' })
    .getByRole('button', { name: 'Система' })
    .click();

  // Журнал пишется всегда и целиком — настройки подробности нет.
  await expect(page.getByText('Подробность журнала для разбора проблем')).toHaveCount(0);
  await expect(page.getByText('Порог технических логов')).toHaveCount(0);
  await expect(page.getByText('Отладка и важнее')).toHaveCount(0);
});

test('в уведомлениях есть только понятные пользователю события', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Уведомления').click();

  // Раздел называется «Уведомления», а не «Лента»: это события приложения,
  // адресованные человеку.
  await expect(page.locator('aside').getByText('Уведомления').first()).toBeVisible();
  await expect(page.getByText('Библиотека открыта')).toBeVisible();
  await expect(page.getByText('Плагин пропущен')).toHaveCount(0);
});

test('журнал диагностики не показывается в ленте уведомлений', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Уведомления').click();

  // Лента — только пользовательские события: технические записи собираются в
  // файл для отчёта.
  await expect(page.getByText('Библиотека открыта')).toBeVisible();
  await expect(page.getByText('Плагин пропущен')).toHaveCount(0);
});
