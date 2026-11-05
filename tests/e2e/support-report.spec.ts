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
  // Индикатора замечаний в шапке тоже нет: это был остаток ленты.
  await expect(page.getByTestId('header-alerts')).toHaveCount(0);
  await expect(page.getByLabel('Настройки', { exact: true })).toBeVisible();
});

test('значок перезапуска виден на телефоне и планшете', async ({ page }) => {
  // Важное сообщение нельзя прятать на узком окне: оно одинаково нужно везде.
  for (const width of [390, 820]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByTestId('nav-settings').waitFor();
    await page.getByTestId('nav-settings').click();
    await page
      .getByRole('navigation', { name: 'Разделы настроек' })
      .getByRole('button', { name: 'Система' })
      .click();
    await page.getByTestId('store-plugins').getByRole('checkbox').first().click();

    const note = page.getByTestId('plugins-restart-note');
    await expect(note).toBeVisible();
    await expect(note).toHaveText('Нужен перезапуск');
  }
});

test('важное в настройках отмечается точкой на кнопке настроек', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  // Пока важного нет, точки нет.
  await expect(page.getByTestId('settings-alert-dot')).toHaveCount(0);

  await page.getByLabel('Настройки', { exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Разделы настроек' })
    .getByRole('button', { name: 'Система' })
    .click();

  // Высота шапки до изменения: значок не должен её менять.
  const headerHeightBefore = (await page.getByTestId('settings-header').boundingBox())!.height;

  // Положение списка и источника до изменения: контекст сдвигаться не должен.
  const listBefore = await page.getByTestId('store-plugins').boundingBox();
  const sourceBefore = await page.getByTestId('store-plugin-source').boundingBox();

  // Выключение плагина требует перезапуска: значок виден в шапке настроек.
  await page.getByTestId('store-plugins').getByRole('checkbox').first().click();
  await expect(page.getByTestId('plugins-restart-note')).toBeVisible();

  // Появление значка ничего не сдвинуло: список и источник стоят на месте.
  const listAfter = await page.getByTestId('store-plugins').boundingBox();
  const sourceAfter = await page.getByTestId('store-plugin-source').boundingBox();
  expect(listAfter!.y).toBe(listBefore!.y);
  expect(sourceAfter!.y).toBe(sourceBefore!.y);

  // Значок стоит в шапке настроек — над разделом, а не внутри него.
  const header = page.getByTestId('settings-header');
  const note = header.getByTestId('plugins-restart-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveText('Нужен перезапуск');

  // Оформление как у значков системы: полное скругление и цвет предупреждения.
  const style = await note.evaluate((el) => {
    const computed = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      radius: Number.parseFloat(computed.borderRadius),
      height: Math.round(box.height),
      visuallyHidden: computed.visibility !== 'visible' || box.width === 0,
    };
  });
  expect(style.visuallyHidden).toBe(false);
  expect(style.radius).toBeGreaterThan(style.height / 2);
  expect(style.height).toBeGreaterThanOrEqual(18);

  // Шапка не выросла: появление значка не сдвинуло содержимое.
  expect(headerHeightBefore).toBe((await header.boundingBox())!.height);

  // Закрываем настройки: на кнопке появилась точка, а подсказка говорит о ней.
  await page.getByRole('button', { name: 'Закрыть настройки' }).click();
  await expect(page.getByTestId('settings-alert-dot')).toBeVisible();
  await expect(page.getByTestId('nav-settings')).toHaveAttribute('title', 'Настройки: есть важное');
});
