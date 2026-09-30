import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев сохранения рабочего места. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'library' };

test('состав и активная вкладка восстанавливаются после перезагрузки', async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: {
                    active_library: () => active,
                    get_workspaces: () => {
                        const raw = window.localStorage.getItem('workspaces');
                        return raw
                            ? JSON.parse(raw)
                            : {
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
                              };
                    },
                    save_workspaces: (payload: unknown) => {
                        const workspaces = (payload as { workspaces?: unknown })?.workspaces;
                        window.localStorage.setItem('workspaces', JSON.stringify(workspaces));
                        return { ok: true };
                    },
                },
            };
    }, ACTIVE_LIBRARY);

    await page.goto('/');
    await page.getByLabel('Рабочее место', { exact: true }).click();
    const open = page.getByTestId('workspace-open').first();
    if (await open.isVisible().catch(() => false)) {
        await open.click();
    }
    const library = page.frameLocator('iframe[title="Library plugin"]');
    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await library.getByRole('button', { name: 'Открыть в рабочем месте' }).click();
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

    await expect
        .poll(async () => {
            const raw = await page.evaluate(() => window.localStorage.getItem('workspaces'));
            const registry = raw ? JSON.parse(raw) : null;
            return registry?.workspaces?.[0]?.tabs?.length ?? 0;
        })
        .toBe(1);

    await page.reload();

    const openAfterReload = page.getByTestId('workspace-open').first();
    await openAfterReload.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    if (await openAfterReload.isVisible().catch(() => false)) {
        await openAfterReload.click();
    }
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
    await expect(page.getByTestId('workplace-tab')).toHaveAttribute('aria-pressed', 'true');
});

test('прежнее одиночное состояние переносится в рабочее место', async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: {
                    active_library: () => active,
                    get_workspaces: () => ({
                        workspaces: [
                            {
                                id: 'default',
                                name: 'Рабочее место',
                                created_at_millis: 1_700_000_000_000,
                                tabs: [
                                    {
                                        id: 't1',
                                        path: '/demo-library/demo-1.epub',
                                        title: 'Демо-книга',
                                        format: 'epub',
                                        zoom: 130,
                                        position: 40,
                                        mode: 'scroll',
                                    },
                                ],
                                active_tab_id: 't1',
                            },
                        ],
                        active_workspace_id: 'default',
                    }),
                },
            };
    }, ACTIVE_LIBRARY);

    await page.goto('/');

    const open = page.getByTestId('workspace-open').first();
    await open.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    if (await open.isVisible().catch(() => false)) {
        await open.click();
    }
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
    await expect(page.getByTestId('reader-zoom')).toHaveText('130%');
});

test('недоступную книгу можно переуказать на файл с диска', async ({ page }) => {
    await page.addInitScript(() => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                // Пользователь выбирает на диске доступный файл книги.
                dialogResult: '/library/demo-1.epub',
                handlers: {
                    // Файл недоступен, пока путь не переуказан: чтение по старому
                    // пути завершается ошибкой, по новому — отдаёт содержимое.
                    reader_content: (payload: unknown) => {
                        const path = (payload as { path?: string })?.path ?? '';
                        if (path.includes('gone')) {
                            throw new Error('файл книги не читается');
                        }
                        return {
                            title: 'Демо-книга',
                            authors: [],
                            chapters: [{ title: 'Глава 1', html: '<p>Первый абзац книги.</p>' }],
                        };
                    },
                    get_workspaces: () => ({
                        workspaces: [
                            {
                                id: 'ws-1',
                                name: 'Рабочее место',
                                created_at_millis: 1_700_000_000_000,
                                tabs: [
                                    {
                                        id: 'tab-gone',
                                        path: '/library/gone-1.epub',
                                        title: 'Пропавшая книга',
                                        format: 'epub',
                                        zoom: 130,
                                        position: 40,
                                        mode: 'scroll',
                                    },
                                ],
                                active_tab_id: 'tab-gone',
                            },
                        ],
                        active_workspace_id: 'ws-1',
                    }),
                    save_workspaces: (payload: unknown) => {
                        const workspaces = (payload as { workspaces?: unknown })?.workspaces;
                        window.localStorage.setItem('workspaces', JSON.stringify(workspaces));
                        return { ok: true };
                    },
                },
            };
    });

    await page.goto('/');

    const open = page.getByTestId('workspace-open').first();
    await open.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    if (await open.isVisible().catch(() => false)) {
        await open.click();
    }
    // Книга не читается — вкладка предлагает указать файл, не падает.
    await expect(page.getByTestId('reader-unavailable')).toBeVisible();
    await page.getByRole('button', { name: 'Указать файл' }).click();

    await expect(page.getByTestId('reader-unavailable')).toHaveCount(0);
    await expect(
        page.frameLocator('iframe[title="Чтение книги"]').getByText('Первый абзац книги.'),
    ).toBeVisible();
});

test('рабочее место читает книгу без открытой библиотеки', async ({ page }) => {
    await page.addInitScript(() => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: {
                    // Библиотека вовсе не открыта: рабочее место не зависит от неё.
                    active_library: () => null,
                    get_workspaces: () => ({
                        workspaces: [
                            {
                                id: 'ws-1',
                                name: 'Рабочее место',
                                created_at_millis: 1_700_000_000_000,
                                tabs: [
                                    {
                                        id: 't1',
                                        path: '/books/с-диска.epub',
                                        title: 'Книга с диска',
                                        format: 'epub',
                                        zoom: 100,
                                        position: 0,
                                        mode: 'scroll',
                                    },
                                ],
                                active_tab_id: 't1',
                            },
                        ],
                        active_workspace_id: 'ws-1',
                    }),
                    save_workspaces: () => ({ ok: true }),
                },
            };
    });

    await page.goto('/');
    const open = page.getByTestId('workspace-open').first();
    await open.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    if (await open.isVisible().catch(() => false)) {
        await open.click();
    }

    // Никакого состояния «библиотека не открыта»: книга просто читается.
    await expect(page.getByTestId('reader-unavailable')).toHaveCount(0);
    await expect(page.getByTestId('reader-error')).toHaveCount(0);
    await expect(
        page.frameLocator('iframe[title="Чтение книги"]').getByText('Первый абзац книги.'),
    ).toBeVisible();
});
