import { expect, test } from '@playwright/test';
import { showLibraryBookList } from './workplace-area';

/** Ответ активной библиотеки для сценариев страницы книги. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
    await page.addInitScript((active) => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ =
            {
                handlers: { active_library: () => active },
            };
    }, ACTIVE_LIBRARY);
});

/** Показ списка книг библиотеки через раздел «Библиотеки». */
async function showLibrary(page: import('@playwright/test').Page) {
    await showLibraryBookList(page);
}

test('клик по книге открывает страницу книги с информацией', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByRole('button', { name: /Демо-книга/ }).click();

    await expect(library.getByTestId('book-title')).toHaveText('Демо-книга');
    await expect(library.getByTestId('book-page').getByText('Тестовый автор')).toBeVisible();
});

test('страница книги предлагает чтение и открытие', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByRole('button', { name: /Демо-книга/ }).click();

    // Формат — отдельная строка со своими действиями: читать здесь и открыть.
    const row = library.getByTestId('book-format-epub');
    await expect(row).toContainText('EPUB');
    await expect(row.getByTestId('book-read-epub')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Открыть' })).toBeVisible();
});

test('для неподдерживаемого формата добавление заблокировано с пояснением', async ({ page }) => {
    await page.addInitScript(() => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
            handlers: {
                active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
                reader_formats: () => [],
                invoke_plugin_operation: (payload: unknown) => {
                    const message = payload as { operation?: string };
                    if (message.operation === 'list' || message.operation === 'search') {
                        return {
                            catalog: {
                                books: [
                                    {
                                        id: 'unsupported',
                                        title: 'Вторая книга',
                                        authors: [],
                                        series: [],
                                        tags: [],
                                        files: [{ kind: 'book', path: 'unsupported.docx', format: 'docx' }],
                                    },
                                ],
                            },
                        };
                    }
                    return {};
                },
            },
        };
    });
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByRole('button', { name: /Вторая книга/ }).click();

    await expect(library.getByTestId('book-title')).toHaveText('Вторая книга');
    // Чтение здесь недоступно, но файл можно открыть.
    await expect(library.getByTestId('book-unsupported')).toContainText('Формат не поддерживается');
    await expect(library.getByTestId('book-read-docx')).toHaveCount(0);
    await expect(library.getByTestId('book-open-docx')).toBeVisible();
    await expect(library.getByText('можно читать здесь')).toHaveCount(0);
});

test('книга с несколькими форматами: показаны все, читается поддерживаемый', async ({
    page,
}) => {
    // У Calibre книга может иметь несколько файлов: один формат читается, другой нет.
    await page.addInitScript(() => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
            handlers: {
                active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
                reader_formats: () => ['epub'],
                invoke_plugin_operation: (payload: unknown) => {
                    const message = payload as { operation?: string };
                    if (message.operation === 'list' || message.operation === 'search') {
                        return {
                            catalog: {
                                books: [
                                    {
                                        id: 'multi',
                                        title: 'Книга в двух форматах',
                                        authors: [],
                                        series: [],
                                        tags: [],
                                        files: [
                                            { kind: 'book', path: 'multi.epub', format: 'epub' },
                                            { kind: 'book', path: 'multi.pdf', format: 'pdf' },
                                        ],
                                    },
                                ],
                            },
                        };
                    }
                    return {};
                },
            },
        };
    });
    await page.goto('/');
    await showLibraryBookList(page);
    const library = page.locator('main');
    await library.getByRole('button', { name: /Книга в двух форматах/ }).click();

    // Оба формата показаны: EPUB читается здесь, PDF — нет.
    await expect(library.getByTestId('book-format-epub')).toBeVisible();
    await expect(library.getByTestId('book-format-pdf')).toBeVisible();
    await expect(library.getByTestId('book-read-epub')).toBeVisible();
    await expect(library.getByTestId('book-read-pdf')).toHaveCount(0);
    await expect(library.getByTestId('book-open-pdf')).toBeVisible();
    await expect(library.getByTestId('book-unsupported')).toHaveCount(0);
});

test('книга с несколькими читаемыми форматами: своя кнопка на каждый формат', async ({
    page,
}) => {
    // Два читаемых формата: на каждый — своя кнопка, выбор одним нажатием.
    await page.addInitScript(() => {
        (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
            handlers: {
                active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
                reader_formats: () => ['pdf'],
                reader_content: (payload: unknown) => {
                    (window as unknown as { __OPENED_PATH__?: string }).__OPENED_PATH__ = String(
                        (payload as { path?: string }).path ?? '',
                    );
                    return {
                        title: 'Книга в двух читаемых',
                        authors: [],
                        chapters: [{ title: 'Глава', html: '<p>Текст</p>' }],
                    };
                },
                invoke_plugin_operation: (payload: unknown) => {
                    const message = payload as { operation?: string };
                    if (message.operation === 'list' || message.operation === 'search') {
                        return {
                            catalog: {
                                books: [
                                    {
                                        id: 'multi',
                                        title: 'Книга в двух читаемых',
                                        authors: [],
                                        series: [],
                                        tags: [],
                                        files: [
                                            { kind: 'book', path: 'multi.epub', format: 'epub' },
                                            { kind: 'book', path: 'multi.fb2', format: 'fb2' },
                                        ],
                                    },
                                ],
                            },
                        };
                    }
                    return {};
                },
            },
        };
    });
    await page.goto('/');
    await showLibraryBookList(page);
    const library = page.locator('main');
    await library.getByRole('button', { name: /Книга в двух читаемых/ }).click();

    // Отдельное действие чтения на каждый формат.
    await expect(library.getByTestId('book-read-epub')).toBeVisible();
    await expect(library.getByTestId('book-read-fb2')).toBeVisible();
    await library.getByTestId('book-read-fb2').click();

    // Затем — выбор рабочего места (его ещё нет).
    const picker = page.getByTestId('workspace-picker-item');
    if (await picker.first().isVisible().catch(() => false)) {
        await picker.first().click();
    }
    await expect(page.getByTestId('workplace-tab')).toHaveText('Книга в двух читаемых');
    // Открылся именно файл FB2, а не первый файл записи.
    await expect
        .poll(() =>
            page.evaluate(() => (window as unknown as { __OPENED_PATH__?: string }).__OPENED_PATH__ ?? ''),
        )
        .toContain('multi.fb2');
});

test('возврат к списку сохраняет поиск', async ({ page }) => {    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByPlaceholder('Название или автор').fill('Демо');
    await library.getByRole('button', { name: /Демо-книга/ }).click();
    await library.getByRole('button', { name: /К списку книг/ }).click();

    await expect(library.getByPlaceholder('Название или автор')).toHaveValue('Демо');
    await expect(library.getByText('Вторая книга')).toBeHidden();
});
