import { expect, test } from '@playwright/test';
import { showLibraryBookList } from './workplace-area';

/** Показ списка книг библиотеки через раздел «Библиотеки». */
async function showLibrary(page: import('@playwright/test').Page) {
    await showLibraryBookList(page);
}

test('оболочка показывает панель и переключает настройки', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Текстура')).toBeVisible();
    await expect(page.getByTestId('workplace-area')).toBeVisible();

    // Полноэкранные настройки: шапка с кнопками разделов скрыта.
    await page.getByLabel('Настройки', { exact: true }).click();
    await expect(page.locator('header')).toBeHidden();

    const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
    await expect(menu.getByRole('button', { name: 'Общие' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Плагины' })).toBeVisible();

    await menu.getByRole('button', { name: 'Плагины' }).click();
    await expect(page.locator('main').getByRole('heading', { name: 'Плагины' })).toBeVisible();
});

test('кнопки верхней панели показывают активный раздел', async ({ page }) => {
    await page.goto('/');

    const libraries = page.getByLabel('Библиотеки', { exact: true });
    const workspace = page.getByLabel('Рабочее место', { exact: true });
    const settings = page.getByLabel('Настройки', { exact: true });

    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
    await expect(libraries).toHaveAttribute('aria-pressed', 'false');
    await expect(settings).toHaveAttribute('aria-pressed', 'false');

    await libraries.click();
    await expect(libraries).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace).toHaveAttribute('aria-pressed', 'false');

    await workspace.click();
    await expect(workspace).toHaveAttribute('aria-pressed', 'true');
    await expect(libraries).toHaveAttribute('aria-pressed', 'false');

    await settings.click();
    await expect(settings).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace).toHaveAttribute('aria-pressed', 'false');
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

    await page.getByLabel('Настройки', { exact: true }).click();
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

    await page.getByLabel('Настройки', { exact: true }).click();
    await expect(page.getByTestId('settings-page')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('settings-page')).toBeHidden();
    await expect(page.locator('header')).toBeVisible();
});

test('кнопка рабочего места открывает список из раздела библиотеки', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();
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

test('повторное нажатие по активной кнопке раздела возвращает к списку рабочих мест', async ({
    page,
}) => {
    await page.goto('/');

    const libraries = page.getByRole('button', { name: 'Библиотеки', exact: true });
    const notes = page.getByRole('button', { name: 'Реестр заметок', exact: true });

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
    // Окно 1200px: открытие панели сужает область настолько, что список не
    // должен переполняться — область переходит на одноколоночную раскладку.
    await page.setViewportSize({ width: 1200, height: 800 });
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
    await page.setViewportSize({ width: 1200, height: 800 });
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
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Реестр заметок', exact: true }).click();
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

test('шапка масштабируется и группирует кнопки', async ({ page }) => {
    // Шапка не должна обрезать кнопки: их границы внутри шапки, а не у её краёв.
    await page.setViewportSize({ width: 1600, height: 800 });
    await page.goto('/');

    const header = page.locator('header');
    const headerBox = await header.boundingBox();
    const settings = page.getByRole('button', { name: 'Настройки', exact: true });
    const settingsBox = await settings.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();
    // Снизу и сверху есть отступ: кнопка не упирается в границы шапки.
    expect(settingsBox!.y).toBeGreaterThan(headerBox!.y + 1);
    expect(settingsBox!.y + settingsBox!.height).toBeLessThan(headerBox!.y + headerBox!.height - 1);

    // Логотип — у левого края: слева от него кнопок нет.
    const logo = header.getByText('Текстура');
    const logoBox = await logo.boundingBox();
    expect(logoBox).not.toBeNull();
    expect(logoBox!.x).toBeLessThan(headerBox!.x + 80);

    // Кнопка настроек — у самого правого края (там же, где потом закрытие).
    const headerRight = headerBox!.x + headerBox!.width;
    expect(settingsBox!.x + settingsBox!.width).toBeLessThanOrEqual(headerRight + 1);

    // Уведомления — левее настроек, правее переключателя темы.
    const theme = page.getByRole('button', { name: 'Переключить тему', exact: true });
    const themeBox = await theme.boundingBox();
    const notifications = page.getByRole('button', { name: 'Уведомления', exact: true });
    const notificationsBox = await notifications.boundingBox();
    expect(themeBox).not.toBeNull();
    expect(notificationsBox).not.toBeNull();
    expect(themeBox!.x + themeBox!.width).toBeLessThan(notificationsBox!.x);
    expect(notificationsBox!.x + notificationsBox!.width).toBeLessThan(settingsBox!.x + 1);

    // Порядок кнопок слева направо: рабочее место, библиотеки, заметки, тема, уведомления, настройки.
    const order = await header
        .getByRole('button')
        .evaluateAll((nodes) =>
            nodes.map((node) => (node as HTMLElement).getAttribute('aria-label') ?? ''),
        );
    const labels = order.filter((label) =>
        ['Настройки', 'Рабочее место', 'Библиотеки', 'Реестр заметок', 'Переключить тему', 'Уведомления'].includes(
            label,
        ),
    );
    expect(labels).toEqual([
        'Рабочее место',
        'Библиотеки',
        'Реестр заметок',
        'Переключить тему',
        'Уведомления',
        'Настройки',
    ]);
});
