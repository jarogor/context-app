import { expect, type Page } from '@playwright/test';

/** Кнопка-иконка рабочего места в верхней панели оболочки. */
export function workspaceButton(page: Page) {
    return page.getByLabel('Рабочее место', { exact: true });
}

/** Поверхность рабочего места: список рабочих мест или вкладки открытого места. */
export function workspaceSurface(page: Page) {
    return page.getByTestId('workplace-surface');
}

/**
 * Видна ли поверхность рабочего места.
 *
 * Проверяется именно видимость поверхности, а не нажатость кнопки в шапке:
 * кнопка активна только в списке рабочих мест, поэтому по ней нельзя судить,
 * открыт ли раздел вообще.
 */
export async function workspaceSurfaceVisible(page: Page): Promise<boolean> {
    return workspaceSurface(page).isVisible().catch(() => false);
}

/** Открытие раздела рабочего места, если он скрыт.
 *
 * Кнопка рабочего места всегда приводит к списку рабочих мест: когда раздел
 * скрыт (открыт другой), нажатие показывает список, а когда раздел уже открыт —
 * ничего не меняет.
 */
export async function openWorkspaceSurface(page: Page) {
    // Готовность оболочки: до её монтирования кнопки и поверхности ещё нет,
    // поэтому проверка видимости до готовности дала бы ложное «скрыто».
    await workspaceButton(page).waitFor({ state: 'visible' });
    if (!(await workspaceSurfaceVisible(page))) {
        await workspaceButton(page).click();
    }
    await expect(workspaceSurface(page)).toBeVisible();
}

/** Показ списка книг библиотеки.
 *
 * Список книг больше не открывается «выключением» рабочего места: он живёт в
 * сценарии библиотеки, поэтому здесь открывается раздел «Библиотеки» и
 * выбирается библиотека — после её открытия показывается список книг.
 */
export async function showLibraryBookList(page: Page) {
    await page.getByLabel('Библиотеки', { exact: true }).click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();
    await page.getByRole('button', { name: /demo-library/ }).click();
    await expect(page.getByTestId('library-page')).toBeVisible();
}

/** Добавление книги вкладкой в текущее рабочее место.
 *
 * Открывает раздел рабочего места, затем список книг кнопкой «Добавить книгу»
 * (это и есть штатный вход в список книг), выбирает книгу по названию и
 * добавляет её вкладкой.
 */
export async function addBookToWorkspace(page: Page, title: string | RegExp) {
    await openWorkspaceSurface(page);
    const open = page.getByTestId('workspace-open').first();
    if (await open.isVisible().catch(() => false)) {
        await open.click();
    }
    await page.getByRole('button', { name: /Добавить книгу/ }).click();
    const library = page.locator('main');
    const back = library.getByRole('button', { name: /К списку/ });
    if ((await back.count()) > 0) {
        await back.click();
    }
    await library.getByRole('button', { name: title }).click();
    await library.getByRole('button', { name: /Добавить в/ }).click();
    await expect(page.getByTestId('workplace-surface')).toBeVisible();
}
