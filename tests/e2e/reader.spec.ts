import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев рабочего места. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'library' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: { active_library: () => active },
    };
  }, ACTIVE_LIBRARY);
});

/** Переход к основному разделу библиотеки, если открыто рабочее место. */
async function showLibrary(page: import('@playwright/test').Page) {
  const workspace = page.getByLabel('Рабочее место');
  if ((await workspace.getAttribute('aria-pressed')) === 'true') {
    await workspace.click();
  }
}

/** Открытие книги вкладкой рабочего места через страницу книги. */
async function openWorkplace(page: import('@playwright/test').Page) {
  await page.goto('/');
  await showLibrary(page);
  const library = page.frameLocator('iframe[title="Library plugin"]');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: 'Открыть в рабочем месте' }).click();
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
}

test('открытие книги добавляет вкладку в рабочее место', async ({ page }) => {
  await openWorkplace(page);

  await expect(page.getByTestId('workplace-tabs')).toBeVisible();
  await expect(page.getByLabel('Рабочее место')).toHaveAttribute('aria-pressed', 'true');
});

test('рабочее место показывает содержимое книги', async ({ page }) => {
  await openWorkplace(page);

  const reader = page.frameLocator('iframe[title="Чтение книги"]');
  await expect(reader.getByText('Первый абзац книги.')).toBeVisible();
  await expect(reader.getByText('Глава 2')).toBeVisible();
});

test('шапка рабочего места оставляет кнопки доступными', async ({ page }) => {
  await openWorkplace(page);

  await expect(page.getByRole('button', { name: 'Библиотеки' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Уведомления' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Настройки' })).toBeVisible();
});

test('масштаб меняет размер текста книги', async ({ page }) => {
  await openWorkplace(page);

  const html = page.frameLocator('iframe[title="Чтение книги"]').locator('html');
  const before = await html.evaluate((element) => getComputedStyle(element).fontSize);

  await page.getByRole('button', { name: 'Увеличить масштаб' }).click();

  await expect(page.getByTestId('reader-zoom')).toHaveText('110%');
  await expect
    .poll(async () => html.evaluate((element) => getComputedStyle(element).fontSize))
    .not.toBe(before);
});

test('масштаб удерживает верхнюю строку на месте', async ({ page }) => {
  await openWorkplace(page);
  const body = page.frameLocator('iframe[title="Чтение книги"]').locator('body');
  const snapshot = (element: HTMLElement) => {
    const document = element.ownerDocument;
    const width = document.defaultView?.innerWidth ?? 0;
    const node = document.elementFromPoint(Math.round(width / 2), 30);
    return {
      text: node?.textContent?.slice(0, 24) ?? '',
      top: node ? node.getBoundingClientRect().top : 0,
    };
  };

  await body.evaluate((element) => {
    element.ownerDocument.scrollingElement?.scrollTo(0, 900);
  });

  const before = await body.evaluate(snapshot);
  await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
  const after = await body.evaluate(snapshot);

  expect(after.text).toBe(before.text);
  expect(Math.abs(after.top - before.top)).toBeLessThan(6);
});

test('прогресс обновляется при прокрутке книги', async ({ page }) => {
  await openWorkplace(page);

  const iframe = page.locator('iframe[title="Чтение книги"]');
  const box = await iframe.boundingBox();
  if (!box) {
    throw new Error('область чтения не найдена');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 1200);

  await expect
    .poll(async () => {
      const text = await page.getByTestId('reader-progress').textContent();
      return Number.parseInt(text ?? '0', 10);
    })
    .toBeGreaterThan(0);
});

test('возврат к библиотеке сохраняет состояние', async ({ page }) => {
  await openWorkplace(page);

  await page.getByLabel('Рабочее место').click();

  const library = page.frameLocator('iframe[title="Library plugin"]');
  await expect(library.getByTestId('book-title')).toHaveText('Демо-книга');
  await expect(page.getByTestId('workplace-surface')).toBeHidden();
});

test('со страницы книги можно вернуться к списку', async ({ page }) => {
  await page.goto('/');
  await showLibrary(page);
  const library = page.frameLocator('iframe[title="Library plugin"]');

  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await expect(library.getByTestId('book-title')).toBeVisible();
  await library.getByRole('button', { name: /К списку/ }).click();

  await expect(library.getByText('Демо-книга')).toBeVisible();
  await expect(library.getByText('Вторая книга')).toBeVisible();
});
