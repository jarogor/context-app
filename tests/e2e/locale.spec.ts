import { expect, test } from '@playwright/test';

/** Выбор значения поля «Язык интерфейса» и сохранение страницы настроек. */
async function chooseLanguage(page: import('@playwright/test').Page, option: string) {
  await page.locator('main').getByRole('button', { name: 'Язык интерфейса' }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await page.getByTestId('settings-page').getByRole('button', { name: 'Сохранить' }).click();
}

test('выбор языка переводит интерфейс без перезапуска', async ({ page }) => {
  await page.goto('/');

  // Исходный язык — русский: подписи разделов и атрибут документа тоже.
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByTestId('nav-workspace')).toHaveAttribute('aria-label', 'Рабочее место');

  await page.getByLabel('Настройки', { exact: true }).click();
  await expect(page.getByTestId('settings-page')).toBeVisible();

  await chooseLanguage(page, 'English');

  // Язык меняется сразу после сохранения, не дожидаясь перезапуска: шапка
  // настроек и меню разделов уже английские.
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('settings-header')).toContainText('General');
  await expect(page.locator('main').getByRole('button', { name: 'General' })).toBeVisible();
  // Поле осталось выбранным и показывает тот же язык уже по-английски.
  await expect(
    page.locator('main').getByRole('button', { name: 'Interface language' }),
  ).toBeVisible();

  // Разделы приложения переводятся вместе со всем интерфейсом.
  await page.getByLabel('Close settings').click();
  await expect(page.getByTestId('nav-workspace')).toHaveAttribute('aria-label', 'Workspace');
  await expect(page.getByTestId('nav-library')).toHaveAttribute('aria-label', 'Books');

  // Имя приложения — тоже текст интерфейса: знак-логотип не меняется, а имя
  // и заголовок документа переводятся.
  await expect(page).toHaveTitle('Context');
  await expect(page.getByTestId('app-name')).toHaveAttribute('aria-label', 'Context');

  await page.getByLabel('Settings', { exact: true }).click();
  await page.locator('main').getByRole('button', { name: 'Interface language' }).click();
  await page.getByRole('option', { name: 'Русский', exact: true }).click();
  await page.getByTestId('settings-page').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page).toHaveTitle('Контекст');
  // Шапка скрыта в настройках: имя приложения проверяется после их закрытия.
  await page.getByLabel('Закрыть настройки').click();
  await expect(page.getByTestId('app-name')).toHaveAttribute('aria-label', 'Контекст');
});

test('даты в списке рабочих мест следуют выбранному языку', async ({ page }) => {
  await page.goto('/');
  // Время создания рабочего места в браузерных тестах фиксировано фикстурой.
  const date = page.getByTestId('workspace-meta');
  await expect(date.first()).toBeVisible();
  await expect(date.first()).toContainText(/\d{2}\.\d{2}\.\d{4}/);

  await page.getByLabel('Настройки', { exact: true }).click();
  await chooseLanguage(page, 'English');
  await page.getByLabel('Close settings').click();

  await expect(date.first()).toContainText(/\d{2}\/\d{2}\/\d{4}/);
});
