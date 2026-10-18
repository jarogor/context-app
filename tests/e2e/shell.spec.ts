import { expect, test } from '@playwright/test';
import { showLibraryBookList } from './workplace-area';

/** Показ списка книг библиотеки через раздел «Библиотеки». */
async function showLibrary(page: import('@playwright/test').Page) {
    await showLibraryBookList(page);
}

test('оболочка показывает панель и переключает настройки', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('section-nav')).toBeVisible();
    await expect(page.getByTestId('workplace-area')).toBeVisible();

    // Полноэкранные настройки: меню разделов скрыто.
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('section-nav')).toBeHidden();

    const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
    await expect(menu.getByRole('button', { name: 'Общие' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Плагины' })).toBeVisible();

    await menu.getByRole('button', { name: 'Плагины' }).click();
    await expect(page.locator('main').getByRole('heading', { name: 'Плагины' })).toBeVisible();
});

test('разделы меню показывают активный раздел', async ({ page }) => {
    await page.goto('/');

    const libraries = page.getByTestId('nav-library');
    const workspace = page.getByTestId('nav-workspace');

    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
    await expect(libraries).toHaveAttribute('aria-pressed', 'false');

    await libraries.click();
    await expect(libraries).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace).toHaveAttribute('aria-pressed', 'false');

    await workspace.click();
    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
    await expect(libraries).toHaveAttribute('aria-pressed', 'false');

    // Открытие настроек показывает полноэкранный раздел, а меню скрывается.
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByTestId('section-nav')).toBeHidden();
});

test('при запуске открыт список рабочих мест', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByLabel('Рабочее место', { exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(page.getByTestId('workplace-area')).toBeVisible();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('закрытие настроек возвращает к списку рабочих мест', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('workspaces-page')).toBeVisible();

    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('navigation', { name: 'Разделы настроек' })).toBeVisible();

    await page.getByLabel('Закрыть настройки').click();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    await expect(page.getByLabel('Рабочее место', { exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
});

test('настройки закрываются клавишей Escape', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('settings-page')).toBeHidden();
    await expect(page.getByTestId('section-nav')).toBeVisible();
});

test('кнопка рабочего места открывает список из раздела библиотеки', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await page.getByRole('button', { name: /demo-library/ }).click();
    await expect(page.locator('main')).toBeVisible();

    await page.getByLabel('Рабочее место', { exact: true }).click();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('кнопка рабочего места активна только в списке и возвращает к нему', async ({ page }) => {
    await page.goto('/');

    const workspace = page.getByLabel('Рабочее место', { exact: true });

    // Старт: показан список рабочих мест — кнопка нажата.
    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('workspaces-page')).toBeVisible();

    // Открытие конкретного места: показаны вкладки, кнопка больше не нажата.
    await page.getByTestId('workspace-open').first().click();
    await expect(page.getByTestId('workplace-tabs')).toBeVisible();
    await expect(workspace).toHaveAttribute('aria-pressed', 'false');

    // Нажатие из открытого места возвращает к списку и снова делает кнопку нажатой.
    await workspace.click();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
});

test('страница библиотек показывает историю с временем', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();

    // Навигационный текст в шапке показывает текущий раздел.
    await expect(page.getByTestId('app-context')).toContainText('Библиотека');
    const entry = page.getByRole('button', { name: /demo-library/ });
    await expect(entry).toBeVisible();
    await expect(page.getByText('books-source', { exact: true })).toBeVisible();
    await expect(entry).toContainText('2023');
});

test('после открытия библиотеки страница выбора закрывается', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await page.getByRole('button', { name: /demo-library/ }).click();

    await expect(page.getByTestId('libraries-page')).toBeHidden();
    await expect(page.locator('main')).toBeVisible();
});

test('список книг открывается через раздел «Библиотеки»', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);

    await expect(page.getByTestId('library-page')).toBeVisible();
});

test('кнопка рабочего места не «отжимается» и не уводит с главной страницы', async ({ page }) => {
    await page.goto('/');

    const workspace = page.getByLabel('Рабочее место', { exact: true });

    // Старт: показан список рабочих мест — кнопка нажата.
    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('workspaces-page')).toBeVisible();

    // Повторное нажатие в списке ничего не меняет: список остаётся, кнопка нажата,
    // страница «Библиотека не открыта» не показывается.
    await workspace.click();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Библиотека не открыта')).toBeHidden();
});

test('раздел остаётся открытым при повторном нажатии по его кнопке', async ({ page }) => {
    await page.goto('/');

    const libraries = page.getByRole('button', { name: 'Библиотека', exact: true });
    const notes = page.getByTestId('nav-notes');
    const workspace = page.getByRole('button', { name: 'Рабочее место', exact: true });

    // Раздел «Библиотеки»: повторное нажатие оставляет раздел открытым.
    await libraries.click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();
    await libraries.click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();

    // Раздел «Заметки»: то же поведение.
    await notes.click();
    await expect(page.getByTestId('notes-library')).toBeVisible();
    await notes.click();
    await expect(page.getByTestId('notes-library')).toBeVisible();

    // Возврат к рабочему месту — своей кнопкой.
    await workspace.click();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('список библиотек адаптивен к ширине окна', async ({ page }) => {
    // Узкое окно: страница не даёт горизонтальной прокрутки и показывает поиск.
    await page.setViewportSize({ width: 600, height: 700 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();
    await expect(page.getByTestId('libraries-page').getByPlaceholder('Поиск библиотеки')).toBeVisible();

    const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noHorizontalScroll).toBe(true);

    // Широкое окно: список остаётся вертикальным, действие выстроено в полосе
    // управления над списком, а не колонкой сбоку.
    await page.setViewportSize({ width: 1400, height: 800 });
    const libraries = page.getByTestId('libraries-page');
    const list = libraries.locator('ul', { has: page.getByTestId('library-item') });
    const listBox = await list.boundingBox();
    const controlsBox = await libraries.getByTestId('page-controls').boundingBox();
    expect(listBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox!.y).toBeLessThan(listBox!.y);
});

test('открытие панели уведомлений не ломает список библиотек', async ({ page }) => {
    // Окно 1024px: открытие панели заметно сужает область; список не должен
    // переполняться по горизонтали.
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();

    await page.getByLabel('Уведомления').click();

    const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noHorizontalScroll).toBe(true);
});

test('открытие панели уведомлений не ломает список рабочих мест', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    // Список рабочих мест открыт при запуске.
    await expect(page.getByTestId('workspaces-page')).toBeVisible();

    await page.getByLabel('Уведомления').click();

    const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noHorizontalScroll).toBe(true);
});

test('открытие панели уведомлений не ломает реестр заметок', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    await page.getByTestId('nav-notes').click();
    await expect(page.getByTestId('notes-library')).toBeVisible();

    await page.getByLabel('Уведомления').click();

    const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noHorizontalScroll).toBe(true);
});

test('реестр заметок и библиотеки используют общую полосу управления', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 800 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await expect(
        page.getByTestId('libraries-page').getByTestId('page-controls'),
    ).toBeVisible();

    await page.getByTestId('nav-notes').click();
    await expect(
        page.getByTestId('notes-library').getByTestId('page-controls'),
    ).toBeVisible();
});

test('меню разделов показывает разделы вкладками верхней панели', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto('/');

    const nav = page.getByTestId('section-nav');
    // Вкладки верхней панели показывают названия разделов.
    await expect(nav).toHaveAttribute('data-mobile', 'false');
    await expect(nav.getByText('Заметки')).toBeVisible();
    await expect(page.getByTestId('nav-notes')).toHaveAttribute('aria-label', 'Заметки');

    // Выбор раздела отмечает вкладку нажатой.
    await page.getByTestId('nav-notes').click();
    await expect(page.getByTestId('nav-notes')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('nav-workspace')).toHaveAttribute('aria-pressed', 'false');
});

test('панель разделов держит вкладки и действия внутри своих границ', async ({ page }) => {
    // Панель разделов не должна обрезать вкладки: их границы внутри панели.
    await page.setViewportSize({ width: 1600, height: 800 });
    await page.goto('/');

    const bar = page.getByTestId('app-bar');
    const barBox = await bar.boundingBox();
    const nav = page.getByTestId('section-nav');
    const navBox = await nav.boundingBox();
    const settings = page.getByTestId('nav-settings');
    const settingsBox = await settings.boundingBox();
    expect(barBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();

    // Служебное действие — справа от вкладок разделов и внутри верхней панели.
    expect(settingsBox!.x).toBeGreaterThanOrEqual(navBox!.x + navBox!.width - 1);
    expect(settingsBox!.x + settingsBox!.width).toBeLessThanOrEqual(barBox!.x + barBox!.width + 1);
    expect(settingsBox!.y + settingsBox!.height).toBeLessThanOrEqual(barBox!.y + barBox!.height + 1);

    // Порядок разделов слева направо: рабочие места, библиотека, заметки.
    const order = await nav
        .getByRole('button')
        .evaluateAll((nodes) =>
            nodes.map((node) => (node as HTMLElement).getAttribute('aria-label') ?? ''),
        );
    const sections = order.filter((label) =>
        ['Рабочее место', 'Библиотека', 'Заметки'].includes(label),
    );
    expect(sections).toEqual(['Рабочее место', 'Библиотека', 'Заметки']);
});
