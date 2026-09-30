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
          document.getElementById('out').textContent = 'Получено ' + String(message.data || '').length + ' байт';
          post({ type: 'progress', value: 42 });
        } else if (message.type === 'zoom') {
          document.documentElement.style.fontSize = message.value + '%';
        }
      });
      post({ type: 'capabilities', value: { zoom: true } });
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

test.beforeEach(async ({ page }) => {
    await page.addInitScript(
        (payload: { viewer: string; books: unknown }) => {
            (
                window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }
            ).__TEXTURE_MOCK_OVERRIDES__ = {
                handlers: {
                    active_library: () => ({ path: '/demo-library', provider_name: 'library' }),
                    reader_formats: () => ['demo'],
                    reader_plugin_for_format: () => 'workplace-demo',
                    reader_viewer: () => payload.viewer,
                    reader_book_chunk: () => ({ chunk: 'AA==', next: 1, total: 1, done: true }),
                    invoke_plugin_operation: () => payload.books,
                },
            };
        },
        { viewer: VIEWER_HTML, books: DEMO_BOOKS },
    );
});

/** Открытие книги формата demo на рабочем месте. */
async function openWorkplace(page: import('@playwright/test').Page) {
    await page.goto('/');
    const workspace = page.getByLabel('Рабочее место', { exact: true });
    if ((await workspace.getAttribute('aria-pressed')) !== 'true') {
        await workspace.click();
    }
    const list = page.getByTestId('workspaces-page');
    if (await list.isVisible().catch(() => false)) {
        const open = page.getByTestId('workspace-open').first();
        await open.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
        if (await open.isVisible().catch(() => false)) {
            await open.click();
        }
    }
    await page.getByRole('button', { name: 'Добавить книгу' }).click();
    const library = page.frameLocator('iframe[title="Library plugin"]');
    const back = library.getByRole('button', { name: /К списку/ });
    if ((await back.count()) > 0) {
        await back.click();
    }
    await library.getByRole('button', { name: /Демо-планшет/ }).click();
    await library.getByRole('button', { name: 'Открыть в рабочем месте' }).click();
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-планшет');
}

test('книга рисующего формата открывается плагином рабочего места', async ({ page }) => {
    await openWorkplace(page);

    const content = page.locator('iframe[title="Содержимое книги"]');
    await expect(content).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(page.getByTestId('workplace-content')).toBeVisible();
    await expect(content.contentFrame().getByText(/Получено/)).toBeVisible();
});

test('плагин рабочего места сообщает прогресс и получает масштаб', async ({ page }) => {
    await openWorkplace(page);

    await expect(page.getByTestId('reader-progress')).toHaveText('42%');

    const html = page.frameLocator('iframe[title="Содержимое книги"]').locator('html');
    const before = await html.evaluate((element) => getComputedStyle(element).fontSize);
    await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
    await expect(page.getByTestId('reader-zoom')).toHaveText('110%');
    await expect
        .poll(async () => html.evaluate((element) => getComputedStyle(element).fontSize))
        .not.toBe(before);
});
