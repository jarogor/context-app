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

/** Показ поверхности рабочего места, если она скрыта. */
export async function openWorkspaceSurface(page: Page) {
    // Готовность оболочки: до её монтирования кнопки и поверхности ещё нет,
    // поэтому проверка видимости до готовности дала бы ложное «скрыто».
    await workspaceButton(page).waitFor({ state: 'visible' });
    if (!(await workspaceSurfaceVisible(page))) {
        await workspaceButton(page).click();
    }
    await expect(workspaceSurface(page)).toBeVisible();
}

/** Возврат к основному разделу: поверхность рабочего места скрывается.
 *
 * Если открыто конкретное место (вкладки), сначала выполняется возврат к списку
 * рабочих мест, и лишь затем раздел закрывается.
 */
export async function leaveWorkspaceSurface(page: Page) {
    // Готовность оболочки: до монтирования кнопки ещё нет.
    await workspaceButton(page).waitFor({ state: 'visible' });
    if (!(await workspaceSurfaceVisible(page))) {
        return;
    }
    const listVisible = await page
        .getByTestId('workspaces-page')
        .isVisible()
        .catch(() => false);
    if (!listVisible) {
        await workspaceButton(page).click();
        await expect(page.getByTestId('workspaces-page')).toBeVisible();
    }
    await workspaceButton(page).click();
    await expect(workspaceSurface(page)).toBeHidden();
}
