import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев реестра рабочих мест. */
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
                            : { workspaces: [], active_workspace_id: null };
                    },
                    save_workspaces: (payload: unknown) => {
                        const workspaces = (payload as { workspaces?: unknown })?.workspaces;
                        window.localStorage.setItem('workspaces', JSON.stringify(workspaces));
                        return { ok: true };
                    },
                },
            };
    }, ACTIVE_LIBRARY);
});

/** Создание рабочего места с указанным именем. */
async function createWorkspace(page: import('@playwright/test').Page, name: string) {
    await page.getByPlaceholder('Новое рабочее место').fill(name);
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect(page.getByTestId('workplace-tabs')).toBeVisible();
}

/** Возврат к списку рабочих мест. */
async function backToList(page: import('@playwright/test').Page) {
    await page.getByTestId('workplace-back-to-list').click();
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
}

test('до готовности реестра показывается загрузка, а не пустой список', async ({ page }) => {
    await page.addInitScript(() => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: {
                    // Реестр приходит с задержкой: до его загрузки нельзя утверждать,
                    // что рабочих мест нет.
                    get_workspaces: () =>
                        new Promise((resolve) =>
                            setTimeout(
                                () =>
                                    resolve({
                                        workspaces: [
                                            {
                                                id: 'ws-1',
                                                name: 'Рабочее место',
                                                created_at_millis: 1,
                                                tabs: [],
                                                active_tab_id: null,
                                            },
                                        ],
                                        active_workspace_id: 'ws-1',
                                    }),
                                400,
                            ),
                        ),
                },
            };
    });

    await page.goto('/');

    // Пока реестр грузится, оболочка ещё не смонтирована: видна загрузка.
    await expect(page.getByTestId('bootstrap-loading')).toBeVisible();
    await expect(page.getByTestId('workspaces-page')).toHaveCount(0);
    await expect(page.getByTestId('workspaces-empty')).toHaveCount(0);
    await expect(page.getByTestId('workspace-open')).toHaveText('Рабочее место');
});

test('ошибка загрузки реестра не выглядит как отсутствие рабочих мест', async ({ page }) => {
    await page.addInitScript(() => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: {
                    get_workspaces: () => {
                        throw new Error('реестр недоступен');
                    },
                },
            };
    });

    await page.goto('/');

    await expect(page.getByTestId('bootstrap-error')).toBeVisible();
    // Пустой список не показывается: «не удалось» и «пусто» — разные состояния.
    await expect(page.getByTestId('workspaces-empty')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
});

test('попытка после ошибки загрузки реестра открывает рабочие места', async ({ page }) => {
    await page.addInitScript(() => {
        let attempts = 0;
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: {
                    get_workspaces: () => {
                        attempts += 1;
                        if (attempts === 1) {
                            throw new Error('реестр недоступен');
                        }
                        return {
                            workspaces: [
                                {
                                    id: 'ws-1',
                                    name: 'Рабочее место',
                                    created_at_millis: 1,
                                    tabs: [],
                                    active_tab_id: null,
                                },
                            ],
                            active_workspace_id: 'ws-1',
                        };
                    },
                },
            };
    });

    await page.goto('/');
    await expect(page.getByTestId('bootstrap-error')).toBeVisible();

    await page.getByRole('button', { name: 'Повторить' }).click();

    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    await expect(page.getByTestId('workspace-open')).toHaveText('Рабочее место');
});

test('пустой реестр показывает подсказку создать рабочее место', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('workspaces-empty')).toBeVisible();
});

test('создание рабочего места добавляет его в список и открывает', async ({ page }) => {
    await page.goto('/');

    await createWorkspace(page, 'Исследование');

    await backToList(page);
    await expect(page.getByTestId('workspace-open')).toHaveText('Исследование');
    await expect(page.getByTestId('workspace-active')).toBeVisible();
});

test('переключение между рабочими местами сохраняет их вкладки', async ({ page }) => {
    await page.goto('/');
    await createWorkspace(page, 'Первое');

    await page.getByRole('button', { name: 'Добавить книгу' }).click();
    const library = page.locator('main');
    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await library.getByRole('button', { name: 'Открыть в рабочем месте' }).click();
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

    await backToList(page);
    await createWorkspace(page, 'Второе');
    await expect(page.getByTestId('workplace-tab')).toHaveCount(0);

    await backToList(page);
    await page.getByTestId('workspace-open').filter({ hasText: 'Первое' }).click();
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

    await backToList(page);
    await page.getByTestId('workspace-open').filter({ hasText: 'Второе' }).click();
    await expect(page.getByTestId('workplace-tab')).toHaveCount(0);
});

test('переименование рабочего места отражается в списке', async ({ page }) => {
    await page.goto('/');
    await createWorkspace(page, 'Черновик');
    await backToList(page);

    await page.getByLabel('Переименовать рабочее место').click();
    await page.getByPlaceholder('Новое имя').fill('Основное');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByTestId('workspace-open')).toHaveText('Основное');
});

test('удаление рабочего места убирает его из списка', async ({ page }) => {
    await page.goto('/');
    await createWorkspace(page, 'Первое');
    await backToList(page);
    await createWorkspace(page, 'Второе');
    await backToList(page);

    await page
        .locator('[data-testid="workspace-item"]', { hasText: 'Первое' })
        .getByLabel('Удалить рабочее место')
        .click();

    await expect(page.getByTestId('workspace-item')).toHaveCount(1);
    await expect(page.getByTestId('workspace-open')).toHaveText('Второе');
    await expect(page.getByTestId('workspace-active')).toBeVisible();
});

test('удаление последнего рабочего места показывает пустой список', async ({ page }) => {
    await page.goto('/');
    await createWorkspace(page, 'Единственное');
    await backToList(page);

    await page.getByLabel('Удалить рабочее место').click();

    await expect(page.getByTestId('workspaces-empty')).toBeVisible();
    await expect(page.getByTestId('workplace-tabs')).toHaveCount(0);
});

test('реестр рабочих мест переживает перезагрузку', async ({ page }) => {
    await page.goto('/');
    await createWorkspace(page, 'Исследование');
    await backToList(page);
    await createWorkspace(page, 'Второе');

    await expect
        .poll(async () => {
            const raw = await page.evaluate(() => window.localStorage.getItem('workspaces'));
            const registry = raw ? JSON.parse(raw) : null;
            return registry?.workspaces?.length ?? 0;
        })
        .toBe(2);

    await page.reload();

    // При запуске открывается список рабочих мест — он и есть точка входа.
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    await expect(page.getByTestId('workspace-open')).toHaveCount(2);
});
