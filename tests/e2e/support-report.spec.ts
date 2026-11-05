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
  await page
    .getByRole('navigation', { name: 'Разделы настроек' })
    .getByRole('button', { name: 'Система' })
    .click();

  // Логи — пункт расположения данных в сведениях о приложении.
  const report = page.getByTestId('app-path-diagnostics');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Логи');
  await expect(report).toContainText('diagnostics.log');

  // Рядом с путём видно занятое место: по нему понятно, сколько занимает
  // состояние приложения и журнал, который отдаётся при обращении.
  await expect(report.getByTestId('app-path-size-diagnostics')).toHaveText(/\d+\s(Б|КБ|МБ|ГБ)/);
  await expect(
    page.getByTestId('app-path-app_data').getByTestId('app-path-size-app_data'),
  ).toHaveText(/\d+\s(Б|КБ|МБ|ГБ)/);

  await report.getByRole('button', { name: 'Экспорт' }).click();
  // Мок-мост возвращает путь сохранённого файла.
  await expect(page.getByTestId('support-report-saved')).toContainText('context-report');
});

test('журнал не настраивается: пользователю нечего в нём решать', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  await page
    .getByRole('navigation', { name: 'Разделы настроек' })
    .getByRole('button', { name: 'Система' })
    .click();

  // Журнал пишется всегда и целиком — настройки подробности нет.
  await expect(page.getByText('Подробность журнала для разбора проблем')).toHaveCount(0);
  await expect(page.getByText('Порог технических логов')).toHaveCount(0);
  await expect(page.getByText('Отладка и важнее')).toHaveCount(0);
});

test('ленты уведомлений нет: в шапке остаются тема и настройки', async ({ page }) => {
  await page.goto('/');

  // Отдельной ленты уведомлений больше нет: события пишутся в журнал
  // диагностики, из которого собирается отчёт.
  await expect(page.getByLabel('Уведомления')).toHaveCount(0);
  await expect(page.getByTestId('notifications-panel')).toHaveCount(0);
  await expect(page.getByLabel('Настройки', { exact: true })).toBeVisible();
});
