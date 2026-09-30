import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев вкладок. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'library' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => active,
        get_workspaces: () => ({
          workspaces: [
            {
              id: 'ws-1',
              name: 'Рабочее место',
              created_at_millis: 1_700_000_000_000,
              tabs: [],
              active_tab_id: null,
            },
          ],
          active_workspace_id: 'ws-1',
        }),
        save_workspaces: () => ({ ok: true }),
      },
    };
  }, ACTIVE_LIBRARY);
});

/** Элемент вкладки по названию книги. */
function tab(page: import('@playwright/test').Page, title: string) {
  return page.locator('[data-testid="workplace-tab-item"]', { hasText: title });
}

/** Добавление книги вкладкой в рабочее место. */
async function addBook(page: import('@playwright/test').Page, title: string) {
  const workspace = page.getByLabel('Рабочее место');
  if ((await workspace.getAttribute('aria-pressed')) !== 'true') {
    await workspace.click();
  }
  await page.getByRole('button', { name: 'Добавить книгу' }).click();
  const library = page.frameLocator('iframe[title="Library plugin"]');
  const back = library.getByRole('button', { name: /К списку/ });
  if ((await back.count()) > 0) {
    await back.click();
  }
  await library.getByRole('button', { name: new RegExp(title) }).click();
  await library.getByRole('button', { name: 'Открыть в рабочем месте' }).click();
  await expect(page.getByTestId('workplace-surface')).toBeVisible();
}

test('переключение вкладок меняет активную книгу', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');

  await expect(tab(page, 'Третья книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await tab(page, 'Демо-книга').getByTestId('workplace-tab').click();

  await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(tab(page, 'Третья книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('закрытие активной вкладки активирует соседнюю', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');

  await tab(page, 'Третья книга').getByTestId('workplace-tab-close').click();

  await expect(page.getByTestId('workplace-tab')).toHaveCount(1);
  await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('дублирование вкладки создаёт независимую вкладку', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  await tab(page, 'Демо-книга').getByLabel('Дублировать вкладку').click();

  await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
  await expect(page.getByTestId('workplace-tab').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('закрытие последней вкладки показывает пустое состояние', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  await tab(page, 'Демо-книга').getByTestId('workplace-tab-close').click();

  await expect(page.getByTestId('workplace-empty')).toBeVisible();
  await expect(page.getByTestId('workplace-tab')).toHaveCount(0);
});

test('панель открытых книг выбирает и закрывает вкладки', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');

  await page.getByRole('button', { name: 'Открытые книги' }).click();
  const panel = page.getByTestId('open-books-panel');
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Демо-книга' }).click();
  await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await panel
    .locator('li', { hasText: 'Третья книга' })
    .getByLabel('Закрыть вкладку')
    .click();
  await expect(page.getByTestId('workplace-tab')).toHaveCount(1);
  await expect(panel).toBeVisible();
});

test('позиция чтения сохраняется при переключении вкладок', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  const iframe = page.locator('iframe[title="Чтение книги"]');
  const box = await iframe.boundingBox();
  if (!box) {
    throw new Error('область чтения не найдена');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 1500);
  await expect
    .poll(async () => {
      const text = await page.getByTestId('reader-progress').textContent();
      return Number.parseInt(text ?? '0', 10);
    })
    .toBeGreaterThan(0);

  await addBook(page, 'Третья книга');
  await tab(page, 'Демо-книга').getByTestId('workplace-tab').click();
  await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await expect
    .poll(async () => {
      const text = await page.getByTestId('reader-progress').textContent();
      return Number.parseInt(text ?? '0', 10);
    })
    .toBeGreaterThan(0);
});
