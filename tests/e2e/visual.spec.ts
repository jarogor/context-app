import { expect, test } from '@playwright/test';
import { showLibraryBookList } from './workspace-surface';

test('снимок оболочки совпадает с эталоном', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Текстура')).toBeVisible();
  await expect(page).toHaveScreenshot('shell.png');
});

test('снимок тёмной темы совпадает с эталоном', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки', { exact: true }).click();

  const settings = page.locator('main');
  await expect(settings.getByTestId('settings-group-heading').first()).toBeVisible();
  await settings.getByRole('button', { name: 'Тема оформления' }).click();
  await page.getByRole('option', { name: 'Тёмная' }).click();
  await page.getByTestId('settings-page').getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await expect(page).toHaveScreenshot('shell-dark.png');
});

/** Выбор рабочего места в диалоге, если он появился при открытии книги. */
async function pickWorkspaceIfAsked(page: import('@playwright/test').Page) {
  const list = page.getByTestId('workspace-picker-list');
  if (await list.isVisible().catch(() => false)) {
    await page.getByTestId('workspace-picker-item').first().click();
  }
}

/** Открытие демо-книги вкладкой рабочего места. */
async function openWorkplaceBook(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: { active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }) },
    };
  });
  await page.goto('/');
  // Показ списка книг библиотеки: раздел «Библиотеки» → открытие библиотеки.
  await showLibraryBookList(page);
  const library = page.locator('main');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /Добавить в/ }).click();
  await pickWorkspaceIfAsked(page);
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
}

test('снимок верхней панели чтения в светлой теме области чтения', async ({ page }) => {
  await openWorkplaceBook(page);
  await expect(page.locator('html')).toHaveAttribute('data-reader-theme', 'light');
  await expect(page.getByTestId('note-toolbar')).toHaveScreenshot('reader-toolbar-light.png');
});

test('снимок верхней панели чтения в тёмной теме', async ({ page }) => {
  await openWorkplaceBook(page);
  await page
    .getByTestId('note-toolbar')
    .getByRole('button', { name: 'Тёмная тема области чтения' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-reader-theme', 'dark');
  await expect(page.getByTestId('note-toolbar')).toHaveScreenshot('reader-toolbar-dark.png');
});
