import { expect, test } from '@playwright/test';

/**
 * Отчёт для поддержки.
 *
 * Идея: пользователь не знает, что искать при сбое, поэтому приложение само
 * собирает всё нужное и отдаёт одним файлом. Проверяется именно это — что отчёт
 * есть в «Системе», собирается одним нажатием и содержит сведения о приложении,
 * платформе, плагинах и журнале.
 */

test('отчёт для поддержки собирается и сохраняется одним действием', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  await page.getByRole('navigation', { name: 'Разделы настроек' })
    .getByRole('button', { name: 'Система' })
    .click();

  const report = page.getByTestId('support-report');
  await expect(report).toBeVisible();
  // Пользователю объяснено, зачем это нужно и что разбираться самому не надо.
  await expect(report).toContainText('Отчёт для поддержки');
  await expect(report).toContainText('приложите его к обращению');

  await report.getByRole('button', { name: /Сохранить отчёт/ }).click();
  // Мок-мост возвращает путь сохранённого файла.
  await expect(page.getByTestId('support-report-saved')).toContainText('context-report');
});

test('в настройках нет технических подробностей, непонятных пользователю', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  await page.getByRole('navigation', { name: 'Разделы настроек' })
    .getByRole('button', { name: 'Система' })
    .click();

  // Настройка называется по смыслу («подробность журнала для разбора проблем»),
  // а варианты объясняют, когда какой нужен.
  await expect(page.getByText('Подробность журнала для разбора проблем')).toBeVisible();
  await expect(page.getByText('Обычный — рекомендуемый')).toBeVisible();
  // Формулировок «порог», «уровень отладки» и тому подобных больше нет.
  await expect(page.getByText('Порог технических логов')).toHaveCount(0);
  await expect(page.getByText('Отладка и важнее')).toHaveCount(0);
});

test('журнал диагностики не показывается в ленте уведомлений', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Уведомления').click();

  // Лента — только пользовательские события: технические записи собираются в
  // файл для отчёта.
  await expect(page.getByText('Библиотека открыта')).toBeVisible();
  await expect(page.getByText('Плагин пропущен')).toHaveCount(0);
});
