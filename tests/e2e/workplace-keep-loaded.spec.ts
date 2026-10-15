import { expect, test } from '@playwright/test';

/** Простейший модуль рисования плагина рабочего места для браузерного теста. */
const VIEWER_HTML = `<!doctype html><html lang="ru"><body>
  <div id="out">Ожидание книги</div>
  <script>
    (function () {
      var C = 'texture-workplace';
      function post(message) { message.channel = C; parent.postMessage(message, '*'); }
      addEventListener('message', function (event) {
        var message = event.data;
        if (!message || message.channel !== C) { return; }
        if (message.type === 'open') {
          document.getElementById('out').textContent = 'Книга открыта';
        }
      });
      post({ type: 'ready' });
    })();
  </script>
</body></html>`;

/** Каталог с книгой формата demo, обслуживаемого плагином рабочего места. */
const DEMO_BOOKS = {
    catalog: {
        books: [
            {
                id: 'demo-workplace',
                title: 'Демо-планшет',
                authors: [],
                tags: [],
                series: [],
                files: [{ kind: 'book', path: 'demo-workplace.demo', format: 'demo' }],
            },
        ],
    },
};

declare global {
    interface Window {
        /** Число порций книги, прочитанных ядром в этом сценарии. */
        __BOOK_CHUNKS__?: number;
    }
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(
        (payload: { viewer: string; books: unknown }) => {
            window.__BOOK_CHUNKS__ = 0;
            (
                window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }
            ).__TEXTURE_MOCK_OVERRIDES__ = {
                handlers: {
                    active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
                    reader_formats: () => ['demo'],
                    reader_plugin_for_format: () => 'format-demo',
                    reader_viewer: () => payload.viewer,
                    reader_book_chunk: () => {
                        window.__BOOK_CHUNKS__ = (window.__BOOK_CHUNKS__ ?? 0) + 1;
                        return { chunk: 'AA==', next: 1, total: 1, done: true };
                    },
                    invoke_plugin_operation: () => payload.books,
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
                    save_workspaces: (value: unknown) => {
                        const registry = (value as { workspaces?: unknown })?.workspaces;
                        window.localStorage.setItem('workspaces', JSON.stringify(registry));
                        return { ok: true };
                    },
                },
            };
        },
        { viewer: VIEWER_HTML, books: DEMO_BOOKS },
    );
});

/** Открытие текущего рабочего места из списка. */
async function openCurrentWorkspace(page: import('@playwright/test').Page) {
    const list = page.getByTestId('workspaces-page');
    if (await list.isVisible().catch(() => false)) {
        const open = page.getByTestId('workspace-open').first();
        await open.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
        if (await open.isVisible().catch(() => false)) {
            await open.click();
        }
    }
    await expect(page.getByTestId('workplace-tabs')).toBeVisible();
}

/** Добавление книги вкладкой в текущее рабочее место. */
async function addBook(page: import('@playwright/test').Page) {
    await openCurrentWorkspace(page);
    await page.getByRole('button', { name: /Добавить книгу/ }).click();
    const library = page.locator('main');
    const back = library.getByRole('button', { name: /К списку/ });
    if ((await back.count()) > 0) {
        await back.click();
    }
    await library.getByRole('button', { name: /Демо-планшет/ }).click();
    await library.getByRole('button', { name: /Добавить в/ }).click();
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-планшет');
    // Книга действительно прочитана: одна порция содержимого.
    await expect.poll(() => page.evaluate(() => window.__BOOK_CHUNKS__ ?? 0)).toBe(1);
}

/** Число прочитанных порций книги. */
function bookChunks(page: import('@playwright/test').Page) {
    return page.evaluate(() => window.__BOOK_CHUNKS__ ?? 0);
}

test('уход в «Библиотеки» и возврат не перечитывает книгу', async ({ page }) => {
    await page.goto('/');
    await addBook(page);

    // Уходим в раздел «Библиотеки» и возвращаемся в «Рабочие места».
    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();
    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();

    // Возврат показывает список рабочих мест, а вкладки остаются смонтированными.
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    await expect(page.getByTestId('workplace-tabs-layer')).toHaveAttribute('data-shown', 'false');
    await expect(page.getByTestId('workplace-tab-page')).toBeAttached();
    // Книга не перечитана: новых порций не появилось.
    expect(await bookChunks(page)).toBe(1);

    // Открытие текущего места показывает уже загруженную книгу без индикатора.
    await page.getByTestId('workspace-open').first().click();
    await expect(page.getByTestId('workplace-tabs-layer')).toHaveAttribute('data-shown', 'true');
    await expect(page.getByTestId('reader-loading')).toHaveCount(0);
    await expect(
        page.frameLocator('iframe[title="Содержимое книги"]').getByText('Книга открыта'),
    ).toBeVisible();
    expect(await bookChunks(page)).toBe(1);
});

test('уход в «Заметки» и возврат не перечитывает книгу', async ({ page }) => {
    await page.goto('/');
    await addBook(page);

    await page.getByRole('button', { name: 'Реестр заметок', exact: true }).click();
    await expect(page.getByTestId('notes-library')).toBeVisible();
    await page.getByRole('button', { name: 'Реестр заметок', exact: true }).click();

    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    await expect(page.getByTestId('workplace-tab-page')).toBeAttached();
    expect(await bookChunks(page)).toBe(1);

    await page.getByTestId('workspace-open').first().click();
    await expect(page.getByTestId('reader-loading')).toHaveCount(0);
    expect(await bookChunks(page)).toBe(1);
});
