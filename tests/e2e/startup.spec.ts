import { expect, test } from '@playwright/test';

// Сценарии запуска приложения: окно показывается после первой отрисовки, а
// статичный экран загрузки виден ещё до сборки Svelte.

test('сервер отдаёт статичный экран загрузки до выполнения скриптов', async ({ request }) => {
    const response = await request.get('/');
    const html = await response.text();

    // Разметка присутствует в самом HTML: окно не пустое, пока грузится бандл.
    expect(html).toContain('id="boot"');
    expect(html).toContain('boot-spinner');
    // Оформление экрана выбирается по сохранённой теме до загрузки бандла.
    expect(html).toContain('context.appearance');
    expect(html).toContain('data-theme');
});

test('статичный экран загрузки следует сохранённой теме', async ({ page }) => {
    await page.addInitScript(() => {
        // Зеркало оформления, которое оболочка оставила от прошлого запуска.
        window.localStorage.setItem(
            'context.appearance',
            JSON.stringify({ theme: 'dark', palette: 'cobalt' }),
        );
    });
    // Модули не загружаются: проверяется именно статичный экран из index.html,
    // а не его состояние после монтирования оболочки.
    await page.route('**/src/**', (route) => route.abort());

    await page.goto('/');
    // Скрипт экрана загрузки выставляет тему и палитру до первого кадра.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'cobalt');
    await expect(page.locator('#boot')).toBeVisible();
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

test('старт не запрашивает форматы чтения', async ({ page }) => {
    await page.addInitScript(() => {
        const globals = window as unknown as {
            __TEXTURE_MOCK_OVERRIDES__: { handlers: Record<string, unknown> };
            __TEXTURE_INVOKED__?: string[];
        };
        globals.__TEXTURE_INVOKED__ = [];
        globals.__TEXTURE_MOCK_OVERRIDES__ = {
            handlers: {
                reader_formats: () => {
                    globals.__TEXTURE_INVOKED__?.push('reader_formats');
                    return ['epub'];
                },
            },
        };
    });

    await page.goto('/');
    await expect(page.getByTestId('workspaces-page')).toBeVisible();

    // Форматы плагинов чтения не нужны первому кадру: до показа библиотеки или
    // открытия книги запрос не выполняется.
    const invoked = await page.evaluate(
        () => (window as unknown as { __TEXTURE_INVOKED__?: string[] }).__TEXTURE_INVOKED__ ?? [],
    );
    expect(invoked).not.toContain('reader_formats');
});
