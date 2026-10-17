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

    await expect(page.getByLabel('Рабочие места', { exact: true })).toHaveAttribute(
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
    await expect(page.getByLabel('Рабочие места', { exact: true })).toHaveAttribute(
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

    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();
    await page.getByRole('button', { name: /demo-library/ }).click();
    await expect(page.locator('main')).toBeVisible();

    await page.getByLabel('Рабочие места', { exact: true }).click();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('кнопка рабочего места активна только в списке и возвращает к нему', async ({ page }) => {
    await page.goto('/');

    const workspace = page.getByLabel('Рабочие места', { exact: true });

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

    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();

    await expect(page.getByTestId('section-title')).toHaveText('Библиотеки');
    const entry = page.getByRole('button', { name: /demo-library/ });
    await expect(entry).toBeVisible();
    await expect(page.getByText('books-source', { exact: true })).toBeVisible();
    await expect(entry).toContainText('2023');
});

test('после открытия библиотеки страница выбора закрывается', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();
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

    const workspace = page.getByLabel('Рабочие места', { exact: true });

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

test('повторное нажатие по активной кнопке раздела возвращает к списку рабочих мест', async ({
    page,
}) => {
    await page.goto('/');

    const libraries = page.getByRole('button', { name: 'Библиотеки', exact: true });
    const notes = page.getByTestId('nav-notes');

    // Раздел «Библиотеки»: повторное нажатие закрывает его и показывает список.
    await libraries.click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();
    await libraries.click();
    await expect(page.getByTestId('libraries-page')).toBeHidden();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();

    // Раздел «Заметки»: то же поведение.
    await notes.click();
    await expect(page.getByTestId('notes-library')).toBeVisible();
    await notes.click();
    await expect(page.getByTestId('notes-library')).toBeHidden();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('список библиотек адаптивен к ширине окна', async ({ page }) => {
    // Узкое окно: страница не даёт горизонтальной прокрутки и показывает поиск.
    await page.setViewportSize({ width: 600, height: 700 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();
    await expect(page.getByTestId('libraries-page').getByPlaceholder('Поиск библиотеки')).toBeVisible();

    const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noHorizontalScroll).toBe(true);

    // Широкое окно: список остаётся колонкой, форма уходит влево.
    await page.setViewportSize({ width: 1400, height: 800 });
    const list = page.locator('ul', { has: page.getByTestId('library-item') });
    const listBox = await list.boundingBox();
    const formBox = await page.getByRole('button', { name: /Открыть библиотеку/ }).boundingBox();
    expect(listBox).not.toBeNull();
    expect(formBox).not.toBeNull();
    expect(formBox!.x).toBeLessThan(listBox!.x);
});

test('открытие панели уведомлений не ломает список библиотек', async ({ page }) => {
    // Окно 1024px: открытие панели (27rem) сужает область ниже точки перелома
    // (44rem = 704px) настолько, что список не должен переполняться — область
    // переходит на одноколоночную раскладку.
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();

    await page.getByLabel('Уведомления').click();

    const columns = page.getByTestId('libraries-page').locator('[class*="max-w-"]').first().locator(':scope > div').first();
    const direction = await columns.evaluate((node) => getComputedStyle(node).flexDirection);
    expect(direction).toBe('column');

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

    const columns = page.getByTestId('workspaces-page').locator('[class*="max-w-"]').first().locator(':scope > div').first();
    const direction = await columns.evaluate((node) => getComputedStyle(node).flexDirection);
    expect(direction).toBe('column');

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

    const columns = page.getByTestId('notes-library').locator('[class*="max-w-"]').first().locator(':scope > div').first();
    const direction = await columns.evaluate((node) => getComputedStyle(node).flexDirection);
    expect(direction).toBe('column');

    const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noHorizontalScroll).toBe(true);
});

test('без открытой панели форма списка остаётся колонкой слева', async ({ page }) => {
    // Широкое окно без панели: раскладка не должна измениться из-за новой точки.
    await page.setViewportSize({ width: 1600, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();
    await expect(page.getByTestId('libraries-page')).toBeVisible();

    const columns = page.getByTestId('libraries-page').locator('[class*="max-w-"]').first().locator(':scope > div').first();
    const direction = await columns.evaluate((node) => getComputedStyle(node).flexDirection);
    expect(direction).toBe('row');
});

test('меню разделов раскрывает и скрывает названия пунктов', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto('/');

    const nav = page.getByTestId('section-nav');
    // При запуске меню раскрыто: названия пунктов видны.
    await expect(nav).toHaveAttribute('data-expanded', 'true');
    await expect(nav.getByText('Заметки')).toBeVisible();

    // Сворачивание: остаются иконки, названия скрыты, доступные имена сохранены.
    await page.getByTestId('nav-collapse').click();
    await expect(nav).toHaveAttribute('data-expanded', 'false');
    await expect(nav.getByText('Заметки')).toHaveCount(0);
    await expect(page.getByTestId('nav-notes')).toHaveAttribute('aria-label', 'Заметки');

    // Разворот обратно.
    await page.getByTestId('nav-expand').click();
    await expect(nav).toHaveAttribute('data-expanded', 'true');
    await expect(nav.getByText('Заметки')).toBeVisible();
});

test('меню разделов держит пункты внутри своих границ', async ({ page }) => {
    // Меню разделов не должно обрезать пункты: их границы внутри меню.
    await page.setViewportSize({ width: 1600, height: 800 });
    await page.goto('/');

    const nav = page.getByTestId('section-nav');
    const navBox = await nav.boundingBox();
    const settings = page.getByTestId('nav-settings');
    const settingsBox = await settings.boundingBox();
    expect(navBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();

    // Настройки — в нижней части меню, а не вне его границ.
    expect(settingsBox!.x).toBeGreaterThanOrEqual(navBox!.x - 1);
    expect(settingsBox!.x + settingsBox!.width).toBeLessThanOrEqual(navBox!.x + navBox!.width + 1);
    expect(settingsBox!.y + settingsBox!.height).toBeLessThanOrEqual(navBox!.y + navBox!.height + 1);

    // Порядок разделов сверху вниз: рабочие места, библиотека, заметки.
    const order = await nav
        .getByRole('button')
        .evaluateAll((nodes) =>
            nodes.map((node) => (node as HTMLElement).getAttribute('aria-label') ?? ''),
        );
    const sections = order.filter((label) =>
        ['Рабочие места', 'Библиотеки', 'Заметки'].includes(label),
    );
    expect(sections).toEqual(['Рабочие места', 'Библиотеки', 'Заметки']);

    // Служебные пункты: уведомления и настройки — ниже разделов.
    expect(order.indexOf('Настройки')).toBeGreaterThan(order.indexOf('Заметки'));
    expect(order.indexOf('Уведомления')).toBeGreaterThan(order.indexOf('Заметки'));
});
