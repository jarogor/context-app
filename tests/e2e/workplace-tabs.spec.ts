import { expect, test } from '@playwright/test';
import { openWorkspaceSurface } from './workspace-surface';

/** Ответ активной библиотеки для сценариев вкладок. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'library' };

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
                    // Лимит открытых вкладок читается на бутстрапе; значение берётся
                    // из глобальной переменной, чтобы тест мог задать его до загрузки
                    // страницы. Без явного задания действует значение по умолчанию 50.
                    window_open_tabs_limit: () =>
                        (
                            window as unknown as {
                                __TEXTURE_MOCK_OPEN_TABS_LIMIT__?: number;
                            }
                        ).__TEXTURE_MOCK_OPEN_TABS_LIMIT__ ?? 50,
                },
            };
    }, ACTIVE_LIBRARY);
});

/** Задание лимита открытых вкладок в моке до загрузки страницы. */
async function setOpenTabsLimit(page: import('@playwright/test').Page, limit: number) {
    await page.addInitScript((value) => {
        (
            window as unknown as { __TEXTURE_MOCK_OPEN_TABS_LIMIT__?: number }
        ).__TEXTURE_MOCK_OPEN_TABS_LIMIT__ = value;
    }, limit);
}

/** Элемент вкладки по названию книги. */
function tab(page: import('@playwright/test').Page, title: string) {
    return page.locator('[data-testid="workplace-tab-item"]', { hasText: title });
}

/** Обёртка кнопки, несущая подсказку `title`. */
function tooltip(page: import('@playwright/test').Page, label: string) {
    return page.locator(`[title]:has([aria-label="${label}"])`);
}

/** Добавление книги вкладкой в рабочее место. */
async function addBook(page: import('@playwright/test').Page, title: string) {
    await openWorkspaceSurface(page);
    const list = page.getByTestId('workspaces-page');
    if (await list.isVisible().catch(() => false)) {
        const open = page.getByTestId('workspace-open').first();
        await open.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
        if (await open.isVisible().catch(() => false)) {
            await open.click();
        }
    }
    await page.getByRole('button', { name: /Добавить книгу/ }).click();
    const library = page.locator('main');
    const back = library.getByRole('button', { name: /К списку/ });
    if ((await back.count()) > 0) {
        await back.click();
    }
    await library.getByRole('button', { name: new RegExp(title) }).click();
    await library.getByRole('button', { name: /Добавить в/ }).click();
    await expect(page.getByTestId('workplace-surface')).toBeVisible();
}

test('переключение вкладок меняет активную книгу', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await addBook(page, 'Третья книга');

    // Имя открытого рабочего места видно в шапке, а библиотеки — нет.
    await expect(page.getByTestId('header-workspace-name')).toHaveText('Рабочее место');
    const header = page.locator('header');
    await expect(header.getByText('library', { exact: true })).toHaveCount(0);
    await expect(header.getByText('demo-library', { exact: true })).toHaveCount(0);

    await expect(tab(page, 'Третья книга').getByTestId('workplace-tab')).toHaveAttribute(
        'aria-pressed',
        'true',
    );

    await tab(page, 'Демо-книга').getByTestId('workplace-tab').click();

    await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(tab(page, 'Третья книга').getByTestId('workplace-tab')).toHaveAttribute(
        'aria-pressed',
        'false',
    );
});

test('закрытие активной вкладки требует подтверждения и активирует соседнюю', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await addBook(page, 'Третья книга');

    await tab(page, 'Третья книга').getByTestId('workplace-tab-close').click();

    // Иконка закрытия не закрывает вкладку сразу — открывается подтверждение.
    await expect(page.getByTestId('workplace-tab-close-question')).toBeVisible();
    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);

    await page.getByRole('button', { name: 'Да' }).click();

    await expect(page.getByTestId('workplace-tab')).toHaveCount(1);
    await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
        'aria-pressed',
        'true',
    );
});

test('отмена подтверждения не закрывает вкладку', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');

    await tab(page, 'Демо-книга').getByTestId('workplace-tab-close').click();
    await expect(page.getByTestId('workplace-tab-close-question')).toBeVisible();

    await page.getByRole('button', { name: 'Нет' }).click();

    await expect(page.getByTestId('workplace-tab-close-question')).toHaveCount(0);
    await expect(page.getByTestId('workplace-tab')).toHaveCount(1);
});

test('дублирование вкладки создаёт независимую вкладку', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');

    await tab(page, 'Демо-книга').getByLabel('Дублировать вкладку').click();

    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
    await expect(page.getByTestId('workplace-tab').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('дублирование вкладки доступно пунктом меню панели открытых вкладок', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');

    await page.getByRole('button', { name: 'Открытые вкладки книг' }).click();
    const panel = page.getByTestId('open-books-panel');

    await panel.getByLabel('Оформление вкладки').click();
    await page.getByRole('menuitem', { name: 'Дублировать вкладку' }).click();

    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
    await expect(page.getByTestId('workplace-tab').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('закрытие последней вкладки показывает пустое состояние', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');

    await tab(page, 'Демо-книга').getByTestId('workplace-tab-close').click();
    await page.getByRole('button', { name: 'Да' }).click();

    await expect(page.getByTestId('workplace-empty')).toBeVisible();
    await expect(page.getByTestId('workplace-tab')).toHaveCount(0);
});

test('панель открытых вкладок выбирает и закрывает вкладки', async ({ page }) => {    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await addBook(page, 'Третья книга');

    await page.getByRole('button', { name: 'Открытые вкладки книг' }).click();
    const panel = page.getByTestId('open-books-panel');
    await expect(panel).toBeVisible();

    await panel.getByRole('button', { name: 'Демо-книга' }).click();
    await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
        'aria-pressed',
        'true',
    );

    // Закрытие из панели — без подтверждения: осознанный пункт меню.
    await panel.locator('li', { hasText: 'Третья книга' }).getByLabel('Оформление вкладки').click();
    await page.getByRole('menuitem', { name: 'Закрыть вкладку' }).click();
    await expect(page.getByTestId('workplace-tab-close-question')).toHaveCount(0);
    await expect(page.getByTestId('workplace-tab')).toHaveCount(1);
    await expect(panel).toBeVisible();
});

/** Страница активной вкладки рабочего места. */
function activePage(page: import('@playwright/test').Page) {
    return page.locator('[data-testid="workplace-tab-page"][data-active="true"]');
}

test('позиция чтения сохраняется при переключении вкладок', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');

    const iframe = activePage(page).locator('iframe[title="Чтение книги"]');
    const box = await iframe.boundingBox();
    if (!box) {
        throw new Error('область чтения не найдена');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 1500);
    await expect
        .poll(async () => {
            const text = await page.getByTestId('reader-progress').textContent();
            return Number.parseInt(text ?? '0', 10);
        })
        .toBeGreaterThan(0);
    const savedProgress = Number.parseInt(
        (await page.getByTestId('reader-progress').textContent()) ?? '0',
        10,
    );

    await addBook(page, 'Третья книга');
    await tab(page, 'Демо-книга').getByTestId('workplace-tab').click();
    await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
        'aria-pressed',
        'true',
    );

    // Книга не перезагружается: позиция сохраняется сразу, без повторного чтения.
    await expect(page.getByTestId('reader-progress')).toHaveText(`${savedProgress}%`);
});

test('вкладки остаются открытыми при переключении', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await addBook(page, 'Третья книга');

    // Обе вкладки смонтированы, видима только активная.
    await expect(page.getByTestId('workplace-tab-page')).toHaveCount(2);
    await expect(activePage(page)).toHaveCount(1);

    await tab(page, 'Демо-книга').getByTestId('workplace-tab').click();

    // Вкладка активной становится другая книга, а прежняя не исчезает.
    await expect(page.getByTestId('workplace-tab-page')).toHaveCount(2);
    await expect(
        page.locator('[data-testid="workplace-tab-page"][data-active="false"]'),
    ).toHaveCount(1);
});

/** Дублирование активной вкладки заданное число раз. */
async function duplicateActive(page: import('@playwright/test').Page, times: number) {
    for (let index = 0; index < times; index += 1) {
        await page
            .locator('[data-testid="workplace-tab-item"]:has([aria-pressed="true"])')
            .getByLabel('Дублировать вкладку')
            .first()
            .click();
    }
}

test('при переполнении вкладки ограничены по ширине, доступны навигация и счётчик', async ({
    page,
}) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await duplicateActive(page, 4);

    // Состав вкладок сохранён, но показаны не все: навигация и счётчик видны.
    await expect(page.getByLabel('Следующие вкладки')).toBeVisible();
    await expect(page.getByLabel('Предыдущие вкладки')).toBeVisible();
    const counter = page.getByTestId('workplace-tabs-counter');
    await expect(counter).toBeVisible();
    await expect(counter).toContainText('из 5');

    const shown = await page.getByTestId('workplace-tab-item').count();
    expect(shown).toBeLessThan(5);
    expect(shown).toBeGreaterThan(0);

    // Кнопки открытия книги закреплены и видны.
    await expect(page.getByLabel('Добавить книгу')).toBeVisible();
    await expect(page.getByLabel('Открыть файл с диска')).toBeVisible();

    // Горизонтальной прокрутки документа нет.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});

test('навигация по вкладкам сдвигает видимый диапазон, не меняя активную вкладку', async ({
    page,
}) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await duplicateActive(page, 4);

    const counter = page.getByTestId('workplace-tabs-counter');
    const atEnd = (await counter.textContent())?.trim() ?? '';
    expect(atEnd).toContain('из 5');

    await page.getByLabel('Предыдущие вкладки').click();
    const shifted = (await counter.textContent())?.trim() ?? '';
    expect(shifted).not.toBe(atEnd);
    expect(shifted).toContain('–4 из 5');

    await page.getByLabel('Следующие вкладки').click();
    await expect(counter).toHaveText(atEnd);

    // Активная вкладка не меняется навигацией: содержимое остаётся тем же.
    await expect(activePage(page)).toHaveCount(1);
});

/** Открытие общего раздела настроек. */
async function openSettings(page: import('@playwright/test').Page) {
    await page.getByLabel('Настройки', { exact: true }).click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
}

/** Закрытие раздела настроек кнопкой в углу страницы настроек. */
async function closeSettings(page: import('@playwright/test').Page) {
    await page.getByLabel('Закрыть настройки').click();
    await expect(page.getByTestId('settings-page')).toBeHidden();
}

/**
 * Запись лимита открытых вкладок через раздел настроек.
 *
 * Выбран настоящий путь через интерфейс, а не прямая эмуляция события
 * `settings:changed`: так проверяется, что значение из поля настроек
 * действительно доходит до поверхности рабочего места. Правка подтверждается
 * единой кнопкой сохранения страницы настроек.
 */
async function saveOpenTabsLimit(page: import('@playwright/test').Page, limit: number) {
    const settings = page.getByTestId('settings-page');
    await settings.getByLabel('Лимит открытых вкладок').fill(String(limit));
    await settings.getByRole('button', { name: 'Сохранить' }).click();
}

test('при лимите, равном числу вкладок, открытие и дублирование заблокированы', async ({
    page,
}) => {
    // Лимит задан до загрузки приложения: первая же вкладка достигает предела.
    await setOpenTabsLimit(page, 1);
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await expect(page.getByTestId('workplace-tab')).toHaveCount(1);

    const add = page.getByLabel('Добавить книгу');
    await expect(add).toBeDisabled();
    await expect(page.getByLabel('Открыть файл с диска')).toBeDisabled();
    await expect(page.getByLabel('Дублировать вкладку').first()).toBeDisabled();

    // Достижение предела — ещё не превышение: подсказка без красного выделения.
    await expect(tooltip(page, 'Добавить книгу')).toHaveAttribute(
        'title',
        'Достигнут лимит открытых вкладок',
    );
    await expect(add).not.toHaveClass(/text-destructive/);
});

test('уменьшение лимита сохраняет вкладки, помечает превышение и уведомляет', async ({
    page,
}) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await addBook(page, 'Третья книга');
    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);

    // Лимит опускается ниже числа открытых вкладок: две вкладки — превышение.
    await openSettings(page);
    await saveOpenTabsLimit(page, 1);
    await closeSettings(page);

    // Вкладки сохранены, открытие заблокировано и выделено, подсказка о превышении.
    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
    const add = page.getByLabel('Добавить книгу');
    await expect(add).toBeDisabled();
    await expect(page.getByLabel('Открыть файл с диска')).toBeDisabled();
    await expect(tooltip(page, 'Добавить книгу')).toHaveAttribute(
        'title',
        'Превышен лимит открытых вкладок',
    );
    await expect(add).toHaveClass(/text-destructive/);
    // Кнопка дублирования вкладки тоже выделена как превышение.
    await expect(page.getByLabel('Дублировать вкладку').first()).toHaveClass(/text-destructive/);

    // Превышение опубликовано в журнал уведомлений (запись пользователя видна).
    await page.getByLabel('Уведомления').click();
    await expect(
        page.locator('aside').getByText(/Превышен лимит открытых вкладок/),
    ).toBeVisible();
    await page.getByLabel('Уведомления').click();

    // Повышение лимита возвращает доступность и снимает выделение превышения.
    await openSettings(page);
    await saveOpenTabsLimit(page, 5);
    await closeSettings(page);

    await expect(add).toBeEnabled();
    await expect(add).not.toHaveClass(/text-destructive/);
    await expect(tooltip(page, 'Добавить книгу')).toHaveAttribute('title', 'Добавить книгу');
    await expect(page.getByLabel('Дублировать вкладку').first()).not.toHaveClass(
        /text-destructive/,
    );
});

/** Открытие панели открытых книг. */
async function openBooks(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Открытые вкладки книг' }).click();
    await expect(page.getByTestId('open-books-panel')).toBeVisible();
}

test('правка оформления вкладки видна и в панели, и на панели вкладок', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openBooks(page);

    const panel = page.getByTestId('open-books-panel');
    // Каждое свойство правится отдельным пунктом меню.
    await panel.getByLabel('Оформление вкладки').click();
    await page.getByRole('menuitem', { name: 'Название' }).click();
    await page.getByLabel('Название вкладки').fill('Черновик');
    await page.getByLabel('Сохранить').click();

    await panel.getByLabel('Оформление вкладки').click();
    await page.getByRole('menuitem', { name: 'Описание' }).click();
    await page.getByLabel('Описание вкладки').fill('сравнение глав');
    await page.getByLabel('Сохранить').click();

    await panel.getByLabel('Оформление вкладки').click();
    await page.getByTestId('menu-icon-star').click();

    // Панель открытых книг: имя, иконка и описание отдельной строкой.
    await expect(panel.getByRole('button', { name: /Черновик/ })).toBeVisible();
    await expect(panel.getByTestId('open-books-item-description')).toHaveText('сравнение глав');

    // Панель вкладок: та же подпись и иконка, описание — в подсказке.
    const item = tab(page, 'Черновик');
    await expect(item.getByTestId('workplace-tab')).toHaveAttribute('title', 'Черновик\nсравнение глав');
    await expect(item.getByTestId('workplace-tab').locator('svg')).toHaveCount(1);
});

test('цвет вкладки заливает её и в панели, и на панели вкладок', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openBooks(page);

    const panel = page.getByTestId('open-books-panel');
    await panel.getByLabel('Оформление вкладки').click();
    await page.getByTestId('menu-color-blue').click();

    // Заливка приглушённым тоном цвета: смешивание с фоном поверхности.
    await expect(panel.getByTestId('open-books-item')).toHaveAttribute('style', /color-mix/);
    await expect(tab(page, 'Демо-книга')).toHaveAttribute('style', /color-mix/);

    // Сброс оформления снимает заливку.
    await panel.getByLabel('Оформление вкладки').click();
    await page.getByRole('menuitem', { name: 'Сбросить оформление' }).click();

    await expect(panel.getByTestId('open-books-item')).not.toHaveAttribute('style', /color-mix/);
    await expect(tab(page, 'Демо-книга')).not.toHaveAttribute('style', /color-mix/);
});

test('поиск по вкладкам фильтрует список и не меняет состав', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await addBook(page, 'Третья книга');
    await openBooks(page);

    const panel = page.getByTestId('open-books-panel');
    await expect(panel.locator('li')).toHaveCount(2);

    await panel.getByLabel('Поиск по вкладкам').fill('Третья');
    await expect(panel.locator('li')).toHaveCount(1);
    await expect(panel.getByRole('button', { name: /Третья книга/ })).toBeVisible();

    // Пустой результат поиска не закрывает вкладки.
    await panel.getByLabel('Поиск по вкладкам').fill('нет такой книги');
    await expect(panel.getByTestId('open-books-search-empty')).toBeVisible();
    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
});

test('правка имени открывается снова после отмены', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openBooks(page);

    const panel = page.getByTestId('open-books-panel');
    await panel.getByLabel('Оформление вкладки').click();
    await page.getByRole('menuitem', { name: 'Название' }).click();
    await expect(page.getByLabel('Название вкладки')).toBeVisible();
    await page.getByLabel('Отмена').click();
    await expect(page.getByLabel('Название вкладки')).toBeHidden();

    // Повторное открытие после отмены снова показывает форму.
    await panel.getByLabel('Оформление вкладки').click();
    await page.getByRole('menuitem', { name: 'Название' }).click();
    await expect(page.getByLabel('Название вкладки')).toBeVisible();
});

test('панели заметок и открытых книг взаимоисключающие', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');

    // Открытие панели открытых книг закрывает панель заметок и наоборот.
    await page.getByRole('button', { name: 'Открытые вкладки книг' }).click();
    await expect(page.getByTestId('open-books-panel')).toBeVisible();

    await page.getByRole('button', { name: 'Заметки' }).click();
    await expect(page.getByTestId('notes-panel')).toBeVisible();
    await expect(page.getByTestId('open-books-panel')).toHaveCount(0);

    await page.getByRole('button', { name: 'Открытые вкладки книг' }).click();
    await expect(page.getByTestId('open-books-panel')).toBeVisible();
    await expect(page.getByTestId('notes-panel')).toHaveCount(0);

    // Панели одной ширины: тот же токен, что у панели заметок.
    const books = await page.getByTestId('open-books-panel').boundingBox();
    await page.getByRole('button', { name: 'Заметки' }).click();
    const notes = await page.getByTestId('notes-panel').boundingBox();
    expect(books).not.toBeNull();
    expect(notes).not.toBeNull();
    expect(Math.abs(books!.width - notes!.width)).toBeLessThanOrEqual(1);
});
