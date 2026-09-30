import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев заметок. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'library' };

test.beforeEach(async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
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
                        const registry = (payload as { workspaces?: unknown })?.workspaces;
                        window.localStorage.setItem('workspaces', JSON.stringify(registry));
                        return { ok: true };
                    },
                },
            };
    }, ACTIVE_LIBRARY);
});

/** Открытие рабочего места из списка. */
async function openWorkspace(page: import('@playwright/test').Page) {
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
}

/** Добавление книги вкладкой в рабочее место. */
async function addBook(page: import('@playwright/test').Page, title: string) {
    await openWorkspace(page);
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

/** Открытие панели заметок. */
async function openNotes(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Заметки' }).click();
    await expect(page.getByTestId('notes-panel')).toBeVisible();
}

/** Документ книги в области чтения. */
function bookDocument(page: import('@playwright/test').Page) {
    return page.frameLocator('iframe[title="Чтение книги"]');
}

/** Выделение абзаца демо-книги и подтверждение создания заметки. */
async function highlightParagraph(page: import('@playwright/test').Page, text: string) {
    const paragraph = bookDocument(page).getByText(text);
    await paragraph.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const selection = element.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.getByTestId('quote-menu')).toBeVisible();
    await page.getByTestId('quote-menu').getByRole('button', { name: 'Создать заметку' }).click();
}

test('выделение показывает меню создания и отмены', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    const paragraph = bookDocument(page).getByText('Первый абзац книги.');
    await paragraph.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const selection = element.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    await expect(page.getByTestId('quote-menu')).toBeVisible();
    await page.getByTestId('quote-menu').getByRole('button', { name: 'Отмена' }).click();

    // Отмена убирает меню и не создаёт заметку.
    await expect(page.getByTestId('quote-menu')).toHaveCount(0);
    await expect(page.getByTestId('notes-item')).toHaveCount(0);
});

test('панель заметок показывает пустое состояние без книги', async ({ page }) => {
    await page.goto('/');
    await openWorkspace(page);
    await openNotes(page);

    await expect(page.getByTestId('notes-panel-empty')).toBeVisible();
});

test('выделение текста создаёт заметку-цитату с подсветкой', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await highlightParagraph(page, 'Первый абзац книги.');

    await expect(page.getByTestId('notes-item-link')).toContainText('Первый абзац книги.');
    const highlighted = bookDocument(page).locator('mark').first();
    await expect(highlighted).toHaveText('Первый абзац книги.');
});

test('заметки идут по расположению в книге, а не по времени добавления', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    // Сначала заметка ниже по тексту, затем выше: в списке верхняя должна быть первой.
    await highlightParagraph(page, 'Второй абзац книги.');
    await highlightParagraph(page, 'Первый абзац книги.');

    const links = page.getByTestId('notes-item-link');
    await expect(links).toHaveCount(2);
    await expect(links.first()).toContainText('Первый абзац книги.');
    await expect(links.last()).toContainText('Второй абзац книги.');
});

test('выделение восстанавливается после перезагрузки страницы', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    // Дожидаемся сохранения реестра: перезагрузка до записи восстановила бы
    // рабочее место без вкладки.
    await expect
        .poll(async () => {
            const raw = await page.evaluate(() => window.localStorage.getItem('workspaces'));
            const registry = raw ? JSON.parse(raw) : null;
            return registry?.workspaces?.[0]?.tabs?.length ?? 0;
        })
        .toBe(1);

    await page.reload();
    await openWorkspace(page);
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
    await openNotes(page);

    await expect(bookDocument(page).locator('mark').first()).toHaveText('Первый абзац книги.');
    await expect(page.getByTestId('notes-item')).toHaveCount(1);
});

test('клик по заметке ведёт к выделению в книге', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Второй абзац книги.');

    await page.getByTestId('notes-item-link').click();

    await expect(bookDocument(page).locator('mark').first()).toHaveText('Второй абзац книги.');
});

test('удаление заметки убирает подсветку из книги', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    await page.getByTestId('notes-panel').getByTitle('Удалить заметку').click();

    await expect(page.getByTestId('notes-item')).toHaveCount(0);
    await expect(bookDocument(page).locator('mark')).toHaveCount(0);
});

test('заметки книги общие для двух вкладок', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await page.getByLabel('Дублировать вкладку').click();
    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);

    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    await page.getByTestId('workplace-tab').first().click();
    await expect(bookDocument(page).locator('mark').first()).toHaveText('Первый абзац книги.');
});
