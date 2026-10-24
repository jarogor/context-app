import { expect, test } from '@playwright/test';
import { openWorkspaceArea } from './workplace-area';

/** Ответ активной библиотеки для сценария. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
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
                    window_open_tabs_limit: () => 50,
                },
            };
    }, ACTIVE_LIBRARY);
});

/** Открытие рабочего места и книги вкладкой. */
async function openBook(page: import('@playwright/test').Page) {
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
    await expect(page.getByTestId('workplace-area')).toBeVisible();
}

test('меню в строке вкладки стоит так же, как меню в строке заметки', async ({ page }) => {
    await openBook(page);

    // Строка списка вкладок.
    await page.getByRole('button', { name: 'Открытые вкладки книг' }).click();
    await expect(page.getByTestId('open-books-panel')).toBeVisible();
    const tabMenu = await page.evaluate(
        ({ row, label }) => {
            const element = document.querySelector(row);
            if (!element) return null;
            const button = element.querySelector(`[aria-label="${label}"]`);
            if (!button) return null;
            const rowBox = element.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            return {
                top: Math.round(buttonBox.top - rowBox.top),
                right: Math.round(rowBox.right - buttonBox.right),
                bottom: Math.round(rowBox.bottom - buttonBox.bottom),
                width: Math.round(buttonBox.width),
                height: Math.round(buttonBox.height),
            };
        },
        { row: '[data-testid="open-books-item"]', label: 'Оформление вкладки' },
    );
    expect(tabMenu).not.toBeNull();

    // Строка списка заметок: заметка создаётся выделением абзаца книги.
    await page.getByRole('button', { name: 'Открытые вкладки книг' }).click();
    await page.getByRole('button', { name: 'Панель заметок' }).click();
    await expect(page.getByTestId('notes-panel')).toBeVisible();
    const frame = page
        .locator('[data-testid="workplace-tab-page"][data-active="true"]')
        .locator('iframe[title="Чтение книги"]')
        .contentFrame();
    const paragraph = frame.getByText('Первый абзац книги.').first();
    await paragraph.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const selection = element.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.getByTestId('quote-menu')).toBeVisible();
    await page.getByTestId('quote-menu').getByTestId('note-color-yellow').click();
    await expect(page.getByTestId('notes-item-link').first()).toBeVisible();

    const noteMenu = await page.evaluate(
        ({ row, label }) => {
            const element = document.querySelector(row);
            if (!element) return null;
            const button = element.querySelector(`[aria-label="${label}"]`);
            if (!button) return null;
            const rowBox = element.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            return {
                top: Math.round(buttonBox.top - rowBox.top),
                right: Math.round(rowBox.right - buttonBox.right),
                bottom: Math.round(rowBox.bottom - buttonBox.bottom),
                width: Math.round(buttonBox.width),
                height: Math.round(buttonBox.height),
            };
        },
        { row: '[data-testid="notes-item"]', label: 'Действия с заметкой' },
    );
    expect(noteMenu).not.toBeNull();

    // Одинаковый вид меню: одни и те же расстояния и размер кнопки в обоих списках.
    expect(tabMenu!.height).toBe(noteMenu!.height);
    expect(tabMenu!.width).toBe(noteMenu!.width);
    expect(Math.abs(tabMenu!.right - noteMenu!.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(tabMenu!.top - noteMenu!.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(tabMenu!.bottom - noteMenu!.bottom)).toBeLessThanOrEqual(1);
});
