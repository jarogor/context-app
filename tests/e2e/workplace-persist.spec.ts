import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев сохранения рабочего места. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'library' };

test('состав и активная вкладка восстанавливаются после перезагрузки', async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => active,
        get_workspace: () => {
          const raw = window.localStorage.getItem('workspace');
          return raw ? JSON.parse(raw) : { tabs: [], activeTabId: null };
        },
        save_workspace: (payload: unknown) => {
          const workspace = (payload as { workspace?: unknown })?.workspace;
          window.localStorage.setItem('workspace', JSON.stringify(workspace));
          return { ok: true };
        },
      },
    };
  }, ACTIVE_LIBRARY);

  await page.goto('/');
  const library = page.frameLocator('iframe[title="Library plugin"]');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: 'Открыть в рабочем месте' }).click();
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => window.localStorage.getItem('workspace'));
      const workspace = raw ? JSON.parse(raw) : null;
      return workspace?.tabs?.length ?? 0;
    })
    .toBe(1);

  await page.reload();
  await page.getByLabel('Рабочее место').click();

  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
  await expect(page.getByTestId('workplace-tab')).toHaveAttribute('aria-pressed', 'true');
});

test('недоступная книга переуказывается на книгу библиотеки', async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => active,
        get_workspace: () => ({
          tabs: [
            {
              id: 'tab-gone',
              bookId: 'gone-1',
              title: 'Пропавшая книга',
              format: 'epub',
              zoom: 130,
              position: 40,
              mode: 'scroll',
            },
          ],
          activeTabId: 'tab-gone',
        }),
        save_workspace: () => ({ ok: true }),
      },
    };
  }, ACTIVE_LIBRARY);

  await page.goto('/');
  await page.getByLabel('Рабочее место').click();

  await expect(page.getByTestId('reader-unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Переуказать файл' }).click();

  const library = page.frameLocator('iframe[title="Library plugin"]');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: 'Открыть в рабочем месте' }).click();

  await expect(page.getByTestId('reader-unavailable')).toHaveCount(0);
  await expect(
    page.frameLocator('iframe[title="Чтение книги"]').getByText('Первый абзац книги.'),
  ).toBeVisible();
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
});
