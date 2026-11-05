import { expect, test, type Page } from '@playwright/test';
import { mockFlowingBook } from './plugin-viewer';
import { openWorkspaceArea } from './workplace-area';

/** Глава со внутренней сноской, внешней ссылкой и ссылкой на другой файл.
 *
 * Разметка сносок повторяет то, что даёт разбор FB2: тело сносок отдельной
 * главой в `div.fb2-notes`, маркеры — ссылки с классом `fb2-note`.
 */
const CHAPTERS = [
  {
    title: 'Глава 1',
    html: '<h2>Глава 1</h2><p>Текст со сноской<a class="fb2-note" href="#note1">[1]</a>, внешняя ссылка <a href="https://example.org/">сайт</a> и ссылка на файл <a class="fb2-note" href="notes.html#note2">[2]</a>.</p>',
  },
  {
    title: 'Сноски',
    html: '<div class="fb2-notes"><section id="note1"><p>[1] Текст первой сноски.</p></section><section id="note2"><p>[2] Текст второй сноски.</p></section></div>',
  },
];

/** Установка мока: книга текучего формата, нарисованная плагином. */
async function installMock(page: Page) {
  await mockFlowingBook(page, 'fb2', CHAPTERS);
}

/** Область содержимого книги. */
function content(page: Page) {
  return page.frameLocator('iframe[title="Содержимое книги"]');
}

/** Открытие книги FB2 вкладкой рабочего места. */
async function openBook(page: Page) {
  await page.goto('/');
  await openWorkspaceArea(page);
  const list = page.getByTestId('workspaces-page');
  if (await list.isVisible().catch(() => false)) {
    const open = page.getByTestId('workspace-open').first();
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
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  const picker = page.getByTestId('workspace-picker-item');
  if (await picker.count()) {
    await picker.first().click();
  }
  await expect(content(page).locator('h2').first()).toBeVisible();
}

/** Состояние книги во вкладке: содержимое на месте, ошибки нет.
 *
 * Проверяется именно документ книги: область остаётся на `srcdoc` и содержит
 * разделы глав. Приложения внутри области быть не должно — раньше клик по
 * ссылке загружал туда сам интерфейс, и вкладка книги ломалась.
 */
async function expectBookIntact(page: Page) {
  // Документ книги остаётся в песочнице `srcdoc`: адрес читается изнутри
  // кадра, потому что снаружи он закрыт политикой того же источника.
  await expect
    .poll(async () =>
      content(page)
        .locator('body')
        .evaluate(() => globalThis.location.href)
        .catch(() => 'none'),
    )
    .toBe('about:srcdoc');
  await expect(content(page).locator('.context-chapter')).not.toHaveCount(0);
  await expect(content(page).getByText('Текст первой сноски.')).toBeAttached();
  await expect(page.getByTestId('reader-unavailable')).toHaveCount(0);
  await expect(page.getByTestId('reader-error')).toHaveCount(0);
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
}

test.beforeEach(async ({ page }) => {
  await installMock(page);
});

// Документ книги живёт в `srcdoc`, поэтому браузер разрешал относительные
// ссылки от документа приложения: клик по сноске загружал в область само
// приложение, и вкладка книги ломалась без возможности вернуться.
test('клик по сноске FB2 открывает меню сноски и не ломает книгу', async ({ page }) => {
  await openBook(page);

  const scrollBefore = await content(page)
    .locator('#viewer, body')
    .first()
    .evaluate((element) => element.ownerDocument.scrollingElement?.scrollTop ?? 0);

  await content(page).locator('a.fb2-note').first().click();
  await expectBookIntact(page);

  // Сноска сначала читается на месте: меню показывает её текст, а не уводит
  // читателя в конец книги.
  const menu = page.getByTestId('footnote-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId('footnote-text')).toContainText('Текст первой сноски.');
  const scrollAfter = await content(page)
    .locator('body')
    .evaluate((body) => body.ownerDocument.scrollingElement?.scrollTop ?? 0);
  expect(scrollAfter).toBe(scrollBefore);

  // Повторный клик по тому же маркеру закрывает меню.
  await content(page).locator('a.fb2-note').first().click();
  await expect(menu).toHaveCount(0);
});

test('переход к сноске из меню и возврат к месту ссылки внутри сноски', async ({ page }) => {
  await openBook(page);

  const source = content(page).locator('a.fb2-note').first();
  await source.click();
  await page.getByTestId('footnote-menu').getByTestId('footnote-goto').click();

  // Переход встаёт на текст сноски, меню закрывается.
  await expect
    .poll(async () =>
      content(page)
        .locator('body')
        .evaluate((body) => {
          const goal = body.ownerDocument.getElementById('note1');
          if (!goal) {
            return -1;
          }
          return Math.round(goal.getBoundingClientRect().top);
        }),
    )
    .toBeLessThan(200);
  await expect(page.getByTestId('footnote-menu')).toHaveCount(0);

  // Возврат — ссылка в самой сноске, поэтому есть у каждой сноски книги.
  await expect(content(page).locator('.context-footnote-back')).toHaveCount(2);

  // Прокрутка вперёд не отменяет возврат: ссылка ведёт к живому маркеру.
  await content(page)
    .locator('body')
    .evaluate((body) => {
      const root = body.ownerDocument.scrollingElement;
      if (root) {
        root.scrollTop = root.scrollHeight;
      }
    });
  await page.waitForTimeout(200);

  await content(page).locator('.context-footnote-back').first().click();
  // Возврат встаёт на маркер сноски, а не на прежнее число пикселей.
  await expect
    .poll(async () =>
      content(page)
        .locator('a.fb2-note')
        .first()
        .evaluate((element) => Math.abs(Math.round(element.getBoundingClientRect().top))),
    )
    .toBeLessThan(400);
  await expectBookIntact(page);
});

test('клик по ссылке на другой файл книги не уводит область', async ({ page }) => {
  await openBook(page);

  await content(page).locator('a.fb2-note').nth(1).click();

  await expectBookIntact(page);
});

test('клик по внешней ссылке не уводит область и открывает её отдельно', async ({ page }) => {
  // Вызов команды перехватывается моком: обработчик добавляется до загрузки
  // страницы, поэтому регистрируется раньше открытия книги.
  const opened: string[] = [];
  await page.exposeFunction('__recordLink', (href: string) => opened.push(href));
  // Перехват ссылки кладётся поверх мока из `beforeEach`: обработчики книги и
  // подключение плагина остаются, добавляется только запись ссылки.
  await page.addInitScript(() => {
    const target = window as unknown as {
      __TEXTURE_MOCK_OVERRIDES__?: { handlers?: Record<string, unknown> };
    };
    const overrides = target.__TEXTURE_MOCK_OVERRIDES__ ?? {};
    overrides.handlers = {
      ...(overrides.handlers ?? {}),
      reader_open_link: (payload: unknown) => {
        const href = (payload as { href?: string } | null)?.href ?? '';
        void (window as unknown as { __recordLink: (value: string) => void }).__recordLink(href);
        return null;
      },
    };
    target.__TEXTURE_MOCK_OVERRIDES__ = overrides;
  });

  await openBook(page);
  await content(page).locator('a[href^="https"]').click();
  await expectBookIntact(page);
  await expect.poll(async () => opened.length).toBe(1);
  expect(opened[0]).toBe('https://example.org/');
});

// Если область всё же ушла с содержимого книги (нестандартная разметка,
// переход, которого не ждали), вкладка возвращает книгу на прежнюю позицию,
// а не остаётся сломанной без права вернуться.
test('область, ушедшая с книги, возвращает содержимое и позицию', async ({ page }) => {
  await openBook(page);

  // Прокрутка вниз, чтобы позиция чтения отличалась от начала.
  await content(page)
    .locator('body')
    .evaluate((body) => {
      const root = body.ownerDocument.scrollingElement;
      if (root) {
        root.scrollTop = root.scrollHeight;
      }
    });
  await page.waitForTimeout(200);
  const progress = await page.getByTestId('reader-progress').textContent();

  // Уход области на чужой документ — то, что раньше делал клик по ссылке.
  await page.locator('iframe[title="Содержимое книги"]').evaluate((element) => {
    element.setAttribute('src', 'about:blank');
  });
  await page.waitForTimeout(500);

  await expectBookIntact(page);
  // Позиция чтения восстановлена: книга не открылась заново с начала.
  await expect.poll(async () => page.getByTestId('reader-progress').textContent()).toBe(progress);
});
