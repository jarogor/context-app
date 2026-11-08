import { expect, test, type Page } from '@playwright/test';
import { showLibraryBookList, workspaceButton } from './workplace-area';

/** Ответ активной библиотеки для сценариев рабочего места. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: { active_library: () => active },
    };
  }, ACTIVE_LIBRARY);
});

/** Документ активной вкладки в области чтения. */
function bookDocument(page: Page) {
  return page
    .locator('[data-testid="workplace-tab-page"][data-active="true"]')
    .locator('iframe[title="Содержимое книги"]')
    .contentFrame();
}

/** Выбор рабочего места в диалоге, если он появился при открытии книги. */
async function pickWorkspaceIfAsked(page: Page) {
  const list = page.getByTestId('workspace-picker-list');
  if (await list.isVisible().catch(() => false)) {
    await page.getByTestId('workspace-picker-item').first().click();
  }
}

/** Открытие демо-книги вкладкой рабочего места. */
async function openDemoBook(page: Page) {
  await page.goto('/');
  await showLibraryBookList(page);
  const library = page.locator('main');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  await pickWorkspaceIfAsked(page);
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
}

test('разделы переключаются с клавиатуры', async ({ page }) => {
  await page.goto('/');
  // Бутстрап монтирует оболочку не мгновенно: клавиши регистрируются вместе с ней.
  await expect(page.getByTestId('section-nav')).toBeVisible();

  // Раздел «Библиотека» открывается книгами активной библиотеки: она уже
  // задана моком, поэтому список библиотек не показывается.
  await page.keyboard.press('Control+2');
  await expect(page.getByTestId('library-page')).toBeVisible();

  await page.keyboard.press('Control+3');
  await expect(page.getByTestId('notes-library')).toBeVisible();

  await page.keyboard.press('Control+1');
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('настройки открываются и закрываются с клавиатуры', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('section-nav')).toBeVisible();

  await page.keyboard.press('Control+,');
  await expect(page.getByTestId('settings-page')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-page')).toBeHidden();
});

test('комбинация раздела работает на русской раскладке', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('section-nav')).toBeVisible();

  // Символ «б» на физической клавише «,»: раскладка не должна иметь значения.
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'б',
        code: 'Comma',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByTestId('settings-page')).toBeVisible();
});

test('панель поиска по книге открывается клавишей и закрывается Escape', async ({ page }) => {
  await openDemoBook(page);

  // Фокус в книге: клавиша пересылается документом книги, а решает реестр.
  await bookDocument(page).getByText('Первый абзац книги.').click();
  await page.keyboard.press('Control+f');

  const search = page.getByTestId('reader-search');
  await expect(search).toBeVisible();
  await expect(search.getByRole('textbox')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
});

test('книга прокручивается клавишами к началу и концу', async ({ page }) => {
  await openDemoBook(page);

  await bookDocument(page).getByText('Первый абзац книги.').click();
  await page.keyboard.press('End');
  await expect
    .poll(async () =>
      bookDocument(page)
        .locator('html')
        .evaluate((root) => Math.round(root.scrollTop)),
    )
    .toBeGreaterThan(0);

  await page.keyboard.press('Home');
  await expect
    .poll(async () =>
      bookDocument(page)
        .locator('html')
        .evaluate((root) => Math.round(root.scrollTop)),
    )
    .toBeLessThan(10);
});

test('панели рабочего места переключаются клавишами', async ({ page }) => {
  await openDemoBook(page);

  await page.keyboard.press('Control+b');
  await expect(page.getByTestId('open-books-panel')).toBeVisible();

  await page.keyboard.press('Control+j');
  await expect(page.getByTestId('open-books-panel')).toHaveCount(0);
  await expect(page.getByTestId('notes-panel')).toBeVisible();

  // Свойства файла — третья панель того же места: открытие закрывает заметки.
  await page.keyboard.press('Control+Shift+I');
  await expect(page.getByTestId('notes-panel')).toHaveCount(0);
  await expect(page.getByTestId('properties-panel')).toBeVisible();
});

test('вкладки переключаются клавишами по кругу', async ({ page }) => {
  await openDemoBook(page);

  // Одна вкладка: переход по кругу ничего не меняет и не теряет книгу.
  await page.keyboard.press('Control+Tab');
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

  // Кнопка рабочего места в шапке не активна: место открыто, не «показан список».
  await expect(workspaceButton(page)).toHaveAttribute('aria-pressed', 'false');
});
