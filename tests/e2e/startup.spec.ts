import { expect, test } from '@playwright/test';

// Сценарии запуска приложения: окно показывается после первой отрисовки, а
// статичный экран загрузки виден ещё до сборки Svelte.

test('сервер отдаёт статичный экран загрузки до выполнения скриптов', async ({ request }) => {
    const response = await request.get('/');
    const html = await response.text();

    // Разметка присутствует в самом HTML: окно не пустое, пока грузится бандл.
    expect(html).toContain('id="boot"');
    expect(html).toContain('boot-spinner');
});

test('приложение показывает окно после первой отрисовки', async ({ page }) => {
    await page.addInitScript(() => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: {
                    show_window: () => {
                        (
                            window as unknown as { __TEXTURE_WINDOW_SHOWN__?: boolean }
                        ).__TEXTURE_WINDOW_SHOWN__ = true;
                        return null;
                    },
                },
            };
    });

    await page.goto('/');
    // Оболочка готова — окно уже должно быть показано.
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    const shown = await page.evaluate(
        () => (window as unknown as { __TEXTURE_WINDOW_SHOWN__?: boolean }).__TEXTURE_WINDOW_SHOWN__ === true,
    );
    expect(shown).toBe(true);
});
