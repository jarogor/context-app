import { expect, test } from '@playwright/test';

/** Открытие страницы настроек. */
async function openSettings(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.getByLabel('Настройки', { exact: true }).click();
    await expect(page.locator('main').getByTestId('settings-group-heading').first()).toBeVisible();
    return page.locator('main');
}

/** Выбор значения в выпадающем списке настроек по его подписи. */
async function chooseSelect(page: import('@playwright/test').Page, label: string, option: string) {
    await page.locator('main').getByRole('button', { name: label }).click();
    await page.getByRole('option', { name: option }).click();
}

/** Выбор значения поля и сохранение единой кнопкой страницы настроек. */
async function chooseAndSave(page: import('@playwright/test').Page, label: string, option: string) {
    await chooseSelect(page, label, option);
    await page.getByTestId('settings-page').getByRole('button', { name: 'Сохранить' }).click();
}

/** Кнопка переключения темы в шапке. */
function themeButton(page: import('@playwright/test').Page) {
    return page.getByLabel('Переключить тему', { exact: true });
}

test('кнопка в шапке переключает только светлую и тёмную', async ({ page }) => {
    await page.goto('/');

    // Исходно системная тема; в тесте ОС светлая. Кнопка показывает текущую
    // сторону и не ведёт в режим «как в системе».
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(themeButton(page)).toHaveAttribute('title', 'Тема: тёмная');

    await themeButton(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(themeButton(page)).toHaveAttribute('title', 'Тема: светлая');

    await themeButton(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(themeButton(page)).toHaveAttribute('title', 'Тема: тёмная');
});

test('нажатие кнопки в режиме «как в системе» ставит противоположную теме ОС', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    // Предпочтение системное, интерфейс показывает тёмную тему ОС.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(themeButton(page)).toHaveAttribute('title', 'Тема: светлая');

    // Первое нажатие ставит противоположную явную сторону, а не третий режим.
    await themeButton(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(themeButton(page)).toHaveAttribute('title', 'Тема: тёмная');
});

test('режим «как в системе» ставится в настройках', async ({ page }) => {
    const settings = await openSettings(page);

    await chooseAndSave(page, 'Тема оформления', 'Тёмная');
    await page.getByLabel('Закрыть настройки').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Вернуть следование теме ОС можно только настройкой: кнопка такого режима не даёт.
    await page.getByLabel('Настройки', { exact: true }).click();
    await chooseAndSave(page, 'Тема оформления', 'Как в системе');
    await page.getByLabel('Закрыть настройки').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(themeButton(page)).toHaveAttribute('title', 'Тема: тёмная');
    expect(settings).toBeTruthy();
});

test('переключение темы кнопкой меняет цвета интерфейса', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const background = await page
        .locator('body')
        .evaluate((element) => getComputedStyle(element).backgroundColor);

    await themeButton(page).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect
        .poll(async () =>
            page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
        )
        .not.toBe(background);
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
});

test('тема оформления есть и кнопкой, и настройкой; палитра — только настройкой', async ({
    page,
}) => {
    const settings = await openSettings(page);

    // Тема интерфейса остаётся настройкой: кнопка в шапке не даёт режим «как в
    // системе», поэтому без поля его было бы не вернуть.
    await expect(settings.getByRole('button', { name: 'Тема оформления' })).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Палитра оформления' })).toBeVisible();
});

test('выбор палитры в настройках меняет цвета интерфейса', async ({ page }) => {
    await openSettings(page);

    await expect(page.locator('html')).toHaveAttribute('data-palette', 'linen');
    const background = await page
        .locator('body')
        .evaluate((element) => getComputedStyle(element).backgroundColor);

    await chooseAndSave(page, 'Палитра оформления', 'Индиго');

    await expect(page.locator('html')).toHaveAttribute('data-palette', 'cobalt');
    await expect
        .poll(async () =>
            page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
        )
        .not.toBe(background);
});

test('то, что переключается кнопкой в чтении, в настройках не дублируется', async ({ page }) => {
    const settings = await openSettings(page);

    // Гарнитура книги и тема области чтения переключаются кнопками в панели
    // чтения; дублировать их полями настроек — лишний путь к тому же значению.
    await expect(settings.getByRole('button', { name: 'Шрифт книги' })).toHaveCount(0);
    await expect(settings.getByRole('button', { name: 'Тема области чтения' })).toHaveCount(0);
    // Палитра кнопки не имеет — остаётся настройкой.
    await expect(settings.getByRole('button', { name: 'Палитра оформления' })).toBeVisible();
});
