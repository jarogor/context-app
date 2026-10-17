import { expect, test } from '@playwright/test';
import { showLibraryBookList, workspaceButton } from './workplace-area';

/** Ответ активной библиотеки для сценариев рабочего места. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: { active_library: () => active },
            };
    }, ACTIVE_LIBRARY);
});

/** Показ списка книг библиотеки через раздел «Библиотеки». */
async function showLibrary(page: import('@playwright/test').Page) {
    await showLibraryBookList(page);
}

/** Выбор рабочего места в диалоге, если он появился при открытии книги. */
async function pickWorkspaceIfAsked(page: import('@playwright/test').Page) {
    const list = page.getByTestId('workspace-picker-list');
    if (await list.isVisible().catch(() => false)) {
        await page.getByTestId('workspace-picker-item').first().click();
    }
}

/** Открытие книги вкладкой рабочего места через страницу книги. */
async function openWorkplace(page: import('@playwright/test').Page) {
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');
    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await library.getByRole('button', { name: /Добавить в/ }).click();
    await pickWorkspaceIfAsked(page);
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
}

test('открытие книги добавляет вкладку в рабочее место', async ({ page }) => {
    await openWorkplace(page);

    await expect(page.getByTestId('workplace-tabs')).toBeVisible();
    // Открыто конкретное место: кнопка рабочего места в шапке не нажата.
    await expect(workspaceButton(page)).toHaveAttribute('aria-pressed', 'false');
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
    // Управление масштабом принадлежит верхней панели чтения.
    await expect(page.getByTestId('note-toolbar').getByTestId('reader-zoom')).toBeVisible();
    await expect
        .poll(async () => html.evaluate((element) => getComputedStyle(element).fontSize))
        .not.toBe(before);
});

test('масштаб удерживает читаемую строку на месте', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 620 });
    await openWorkplace(page);
    const body = page.frameLocator('iframe[title="Чтение книги"]').locator('body');
    const snapshot = (element: HTMLElement) => {
        const document = element.ownerDocument;
        const width = document.defaultView?.innerWidth ?? 0;
        const node = document.elementFromPoint(Math.round(width / 2), 40);
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

    // Строка, читаемая у верха области, остаётся той же и не уезжает.
    expect(after.text).toBe(before.text);
    expect(Math.abs(after.top - before.top)).toBeLessThan(8);
});

test('открытие панели заметок не сбивает читаемое место', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await openWorkplace(page);
    const body = page.frameLocator('iframe[title="Чтение книги"]').locator('body');
    const frame = page.locator('iframe[title="Чтение книги"]');
    const snapshot = (element: HTMLElement) => {
        const document = element.ownerDocument;
        const width = document.defaultView?.innerWidth ?? 0;
        const node = document.elementFromPoint(Math.round(width / 2), 40);
        return {
            text: node?.textContent?.slice(0, 24) ?? '',
            top: node ? node.getBoundingClientRect().top : 0,
        };
    };

    await body.evaluate((element) => {
        element.ownerDocument.scrollingElement?.scrollTo(0, 900);
    });
    const before = await body.evaluate(snapshot);
    const widthBefore = await frame.evaluate((element) => element.clientWidth);

    await page.getByRole('button', { name: 'Панель заметок' }).click();
    await expect(page.getByTestId('notes-panel')).toBeVisible();
    // Дожидаемся перестройки текста под новую ширину области чтения.
    await expect
        .poll(async () => frame.evaluate((element) => element.clientWidth))
        .toBeLessThan(widthBefore);

    const after = await body.evaluate(snapshot);
    // Панель меняет ширину текста, но читаемая строка остаётся на месте.
    expect(after.text).toBe(before.text);
    expect(Math.abs(after.top - before.top)).toBeLessThan(30);
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

test('переключатель меняет тему области чтения, не трогая тему интерфейса', async ({
    page,
}) => {
    await openWorkplace(page);

    const root = page.locator('html');
    const readerHtml = page.frameLocator('iframe[title="Чтение книги"]').locator('html');
    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(root).toHaveAttribute('data-reader-theme', 'light');
    await expect(readerHtml).toHaveAttribute('data-reader-theme', 'light');

    // Переключатель темы принадлежит единой панели чтения.
    const toggle = page.getByTestId('note-toolbar').getByTestId('reader-theme-toggle');
    await expect(toggle).toBeVisible();

    await toggle.getByRole('button', { name: 'Тёмная тема области чтения' }).click();

    await expect(root).toHaveAttribute('data-reader-theme', 'dark');
    await expect(readerHtml).toHaveAttribute('data-reader-theme', 'dark');
    // Интерфейсная тема независима и не меняется вместе с областью чтения.
    await expect(root).toHaveAttribute('data-theme', 'light');

    await toggle.getByRole('button', { name: 'Светлая тема области чтения' }).click();
    await expect(root).toHaveAttribute('data-reader-theme', 'light');
    await expect(readerHtml).toHaveAttribute('data-reader-theme', 'light');
});

test('возврат к библиотеке сохраняет состояние', async ({ page }) => {
    await openWorkplace(page);

    // Возврат к списку книг: кнопка «Добавить книгу» в панели вкладок — штатный
    // вход в список книг.
    await page.getByRole('button', { name: /Добавить книгу/ }).click();

    const library = page.locator('main');
    await expect(library.getByTestId('book-title')).toHaveText('Демо-книга');
    await expect(page.getByTestId('workplace-area')).toBeHidden();
});

test('со страницы книги можно вернуться к списку', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await expect(library.getByTestId('book-title')).toBeVisible();
    await library.getByRole('button', { name: /К списку книг/ }).click();

    await expect(library.getByText('Демо-книга')).toBeVisible();
    await expect(library.getByText('Вторая книга')).toBeVisible();
});
