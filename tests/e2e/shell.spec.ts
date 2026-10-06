import { expect, test } from '@playwright/test';

/** Закрытие поверхности рабочего места, чтобы показать основной раздел библиотеки. */
async function showLibrary(page: import('@playwright/test').Page) {
    const workspace = page.getByLabel('Рабочее место', { exact: true });
    if ((await workspace.getAttribute('aria-pressed')) === 'true') {
        await workspace.click();
    }
}

test('оболочка показывает панель и переключает настройки', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Текстура')).toBeVisible();
    await expect(page.getByTestId('workplace-surface')).toBeVisible();

    await page.getByLabel('Настройки').click();

    const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
    await expect(menu.getByRole('button', { name: 'Настройки' })).toBeVisible();
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
    await expect(page.getByTestId('workplace-surface')).toBeVisible();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('закрытие настроек возвращает к списку рабочих мест', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('workspaces-page')).toBeVisible();

    await page.getByLabel('Настройки').click();
    await expect(page.getByRole('navigation', { name: 'Разделы настроек' })).toBeVisible();

    await page.getByLabel('Настройки').click();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    await expect(page.getByLabel('Рабочее место', { exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
});

test('кнопка рабочего места открывает список из раздела библиотеки', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();
    await page.getByRole('button', { name: /demo-library/ }).click();
    await expect(page.locator('main')).toBeVisible();

    await page.getByLabel('Рабочее место', { exact: true }).click();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('страница библиотек показывает историю с временем', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();

    await expect(page.getByTestId('section-title')).toHaveText('Библиотеки');
    const entry = page.getByRole('button', { name: /demo-library/ });
    await expect(entry).toBeVisible();
    await expect(page.getByText('library', { exact: true })).toBeVisible();
    await expect(entry).toContainText('2023');
});

test('после открытия библиотеки страница выбора закрывается', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Библиотеки', exact: true }).click();
    await page.getByRole('button', { name: /demo-library/ }).click();

    await expect(page.getByTestId('libraries-page')).toBeHidden();
    await expect(page.locator('main')).toBeVisible();
});

test('основной раздел библиотеки возвращается после закрытия рабочего места', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);

    await expect(page.locator('main')).toBeVisible();
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

    // Кнопка настроек — самая правая и прижата к правому краю.
    const headerRight = headerBox!.x + headerBox!.width;
    const theme = page.getByRole('button', { name: 'Переключить тему', exact: true });
    const themeBox = await theme.boundingBox();
    expect(themeBox).not.toBeNull();
    expect(themeBox!.x + themeBox!.width).toBeLessThan(settingsBox!.x);

    // Порядок кнопок слева направо: рабочее место, библиотеки, заметки, уведомления, тема, настройки.
    const order = await header
        .getByRole('button')
        .evaluateAll((nodes) =>
            nodes.map((node) => (node as HTMLElement).getAttribute('aria-label') ?? ''),
        );
    const labels = order.filter((label) =>
        ['Рабочее место', 'Библиотеки', 'Реестр заметок', 'Уведомления', 'Переключить тему', 'Настройки'].includes(
            label,
        ),
    );
    expect(labels).toEqual([
        'Рабочее место',
        'Библиотеки',
        'Реестр заметок',
        'Уведомления',
        'Переключить тему',
        'Настройки',
    ]);
});
