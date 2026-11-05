import { expect, test } from '@playwright/test';
import { openWorkspaceArea } from './workplace-area';

/** Простейший модуль рисования плагина рабочего места для браузерного теста. */
const VIEWER_HTML = `<!doctype html><html lang="ru"><body>
  <div id="out">Ожидание книги</div>
  <script>
    (function () {
      var C = 'context-workplace';
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
      (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
        handlers: {
          active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
          reader_formats: () => ['demo'],
          reader_plugin_for_format: () => 'format-mock',
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
  await openWorkspaceArea(page);
  const list = page.getByTestId('workspaces-page');
  if (await list.isVisible().catch(() => false)) {
    const open = page.getByTestId('workspace-open').first();
    await open.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    if (await open.isVisible().catch(() => false)) {
      await open.click();
    }
  }
  await page.getByRole('button', { name: /Добавить книгу/ }).click();
  const library = page.locator('main');
  const back = library.getByRole('button', { name: /К списку книг/ });
  if ((await back.count()) > 0) {
    await back.click();
  }
  await library.getByRole('button', { name: /Демо-планшет/ }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
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
  // Управление масштабом расположено в единой панели чтения.
  await expect(page.getByTestId('note-toolbar').getByTestId('reader-zoom')).toBeVisible();
  await expect
    .poll(async () => html.evaluate((element) => getComputedStyle(element).fontSize))
    .not.toBe(before);
});

test('сосредоточенное чтение скрывает хром и возвращает его без потери состояния', async ({
  page,
}) => {
  await openWorkplace(page);

  // Хром интерфейса виден: меню разделов, панель вкладок, панель чтения.
  await expect(page.getByTestId('section-nav')).toBeVisible();
  await expect(page.getByTestId('workplace-tabs')).toBeVisible();
  await expect(page.getByTestId('note-toolbar')).toBeVisible();

  await page.getByRole('button', { name: 'Сосредоточенное чтение' }).click();

  // Хром скрыт: меню разделов; панель вкладок остаётся минимальной полосой с
  // кнопкой выхода из режима.
  await expect(page.getByTestId('section-nav')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Выйти из сосредоточенного чтения' }),
  ).toBeVisible();
  // Книга остаётся открытой: содержимое на месте.
  await expect(
    page.frameLocator('iframe[title="Содержимое книги"]').getByText('Получено'),
  ).toBeVisible();

  // Панели вкладок и заметок продолжают работать в режиме: их кнопки
  // остаются на полосе, и нажатие показывает саму панель, а не только
  // отмечает кнопку нажатой.
  await expect(page.getByTestId('workplace-tabs')).toBeVisible();
  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  await expect(page.getByTestId('open-books-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  await expect(page.getByTestId('open-books-panel')).toHaveCount(0);
  await page.getByTestId('workplace-notes-toggle').click();
  await expect(page.getByTestId('notes-panel')).toBeVisible();
  await page.getByTestId('workplace-notes-toggle').click();
  await expect(page.getByTestId('notes-panel')).toHaveCount(0);

  // Выход возвращает раскладку, а состояние чтения не изменяется.
  await page.getByRole('button', { name: 'Выйти из сосредоточенного чтения' }).click();
  await expect(page.getByTestId('section-nav')).toBeVisible();
  await expect(page.getByTestId('workplace-tabs')).toBeVisible();
  await expect(page.getByTestId('reader-progress')).toHaveText('42%');
});
