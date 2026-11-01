import { expect, test } from '@playwright/test';
import { showLibraryBookList } from './workplace-area';

test('снимок оболочки совпадает с эталоном', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('section-nav')).toBeVisible();
  await expect(page).toHaveScreenshot('shell.png');
});

test('снимок тёмной темы совпадает с эталоном', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Настройки', { exact: true }).click();

  const settings = page.locator('main');
  await expect(settings.getByTestId('settings-group-heading').first()).toBeVisible();
  await page.getByLabel('Закрыть настройки').click();
  // Тема переключается кнопкой в шапке: светлая → тёмная (одно нажатие).
  await page.getByLabel('Переключить тему', { exact: true }).click();
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
  await library.getByRole('button', { name: /Читать/ }).click();
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

test('список рабочих мест читается в светлой палитре Gruvbox', async ({ page }) => {
  // Регрессия: в Gruvbox карточка почти совпадала с фоном, и список сливался.
  await page.addInitScript(() => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: { theme_palette: () => 'gruvbox' },
    };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'gruvbox');
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
  await expect(page).toHaveScreenshot('workspaces-gruvbox.png');
});

test('снимок страницы книги с несколькими форматами', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
        reader_formats: () => ['pdf'],
        invoke_plugin_operation: () => ({
          catalog: {
            books: [
              {
                id: 'multi',
                title: 'Книга в двух форматах',
                authors: ['Тестовый автор'],
                series: [],
                tags: [],
                files: [
                  { kind: 'book', path: 'multi.fb2', format: 'fb2' },
                  { kind: 'book', path: 'multi.pdf', format: 'pdf' },
                ],
              },
            ],
          },
        }),
      },
    };
  });
  await page.goto('/');
  await showLibraryBookList(page);
  const library = page.locator('main');
  await library.getByRole('button', { name: /Книга в двух форматах/ }).click();
  await expect(library.getByTestId('book-page')).toHaveScreenshot('book-page-formats.png');
});
