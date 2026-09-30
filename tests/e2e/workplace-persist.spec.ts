import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев сохранения рабочего места. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'library' };

test('состав и активная вкладка восстанавливаются после перезагрузки', async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => active,
        get_workspaces: () => {
          const raw = window.localStorage.getItem('workspaces');
          return raw
            ? JSON.parse(raw)
            : {
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
              };
        },
        save_workspaces: (payload: unknown) => {
          const workspaces = (payload as { workspaces?: unknown })?.workspaces;
          window.localStorage.setItem('workspaces', JSON.stringify(workspaces));
          return { ok: true };
        },
      },
    };
  }, ACTIVE_LIBRARY);

  await page.goto('/');
  await page.getByLabel('Рабочее место').click();
  const library = page.frameLocator('iframe[title="Library plugin"]');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: 'Открыть в рабочем месте' }).click();
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => window.localStorage.getItem('workspaces'));
      const registry = raw ? JSON.parse(raw) : null;
      return registry?.workspaces?.[0]?.tabs?.length ?? 0;
    })
    .toBe(1);

  await page.reload();

  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
  await expect(page.getByTestId('workplace-tab')).toHaveAttribute('aria-pressed', 'true');
});

test('прежнее одиночное состояние переносится в рабочее место', async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => active,
        get_workspaces: () => ({
          workspaces: [
            {
              id: 'default',
              name: 'Рабочее место',
              created_at_millis: 1_700_000_000_000,
              tabs: [
                {
                  id: 't1',
                  book_id: 'demo-1',
                  title: 'Демо-книга',
                  format: 'epub',
                  zoom: 130,
                  position: 40,
                  mode: 'scroll',
                },
              ],
              active_tab_id: 't1',
            },
          ],
          active_workspace_id: 'default',
        }),
      },
    };
  }, ACTIVE_LIBRARY);

  await page.goto('/');

  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
  await expect(page.getByTestId('reader-zoom')).toHaveText('130%');
});

test('недоступная книга переуказывается на книгу библиотеки', async ({ page }) => {
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
              tabs: [
                {
                  id: 'tab-gone',
                  book_id: 'gone-1',
                  title: 'Пропавшая книга',
                  format: 'epub',
                  zoom: 130,
                  position: 40,
                  mode: 'scroll',
                },
              ],
              active_tab_id: 'tab-gone',
            },
          ],
          active_workspace_id: 'ws-1',
        }),
        save_workspaces: () => ({ ok: true }),
      },
    };
  }, ACTIVE_LIBRARY);

  await page.goto('/');

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
