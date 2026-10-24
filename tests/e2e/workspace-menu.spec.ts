import { expect, test } from '@playwright/test';

const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
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
                window_open_tabs_limit: () => 50,
            },
        };
    }, ACTIVE_LIBRARY);
});

test('меню рабочего места как меню библиотеки', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('workspaces-page')).toBeVisible();

    const measure = (label: string) =>
        page.evaluate((ariaLabel) => {
            const button = document.querySelector(`[aria-label="${ariaLabel}"]`);
            if (!button) return null;
            const box = button.getBoundingClientRect();
            const s = getComputedStyle(button);
            return {
                w: Math.round(box.width),
                h: Math.round(box.height),
                pad: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                cls: button.className,
            };
        }, label);

    const workspaceMenu = await measure('Действия с рабочим местом');
    console.log('РАБОЧЕЕ МЕСТО:', JSON.stringify(workspaceMenu));

    await page.getByTestId('nav-library').click();
    await expect(page.getByTestId('library-item').first()).toBeVisible();
    const libraryMenu = await measure('Действия с библиотекой');
    console.log('БИБЛИОТЕКА:', JSON.stringify(libraryMenu));

    expect(workspaceMenu).not.toBeNull();
    expect(libraryMenu).not.toBeNull();
    expect(workspaceMenu!.w).toBe(libraryMenu!.w);
    expect(workspaceMenu!.h).toBe(libraryMenu!.h);
    expect(workspaceMenu!.pad).toBe(libraryMenu!.pad);
});
