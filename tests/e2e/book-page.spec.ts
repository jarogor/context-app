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

    await expect(library.getByRole('button', { name: /Добавить в/ })).toBeVisible();
    await expect(library.getByRole('button', { name: 'Открыть' })).toBeVisible();
});

test('для неподдерживаемого формата добавление заблокировано с пояснением', async ({ page }) => {
    await page.goto('/');
    await showLibrary(page);
    const library = page.locator('main');

    await library.getByRole('button', { name: /Вторая книга/ }).click();

    await expect(library.getByTestId('book-title')).toHaveText('Вторая книга');
    // Кнопка добавления есть, но заблокирована; рядом — понятное пояснение.
    await expect(library.getByRole('button', { name: /Добавить в/ })).toBeDisabled();
    await expect(library.getByTestId('book-unsupported')).toContainText('Формат не поддерживается');
    await expect(library.getByRole('button', { name: 'Открыть' })).toBeVisible();
    // Бессмысленной плашки «можно читать здесь» больше нет.
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

    // Оба формата показаны; добавление доступно, потому что EPUB читается.
    const page_ = library.getByTestId('book-page');
    await expect(page_.getByText('EPUB')).toBeVisible();
    await expect(page_.getByText('PDF')).toBeVisible();
    await expect(library.getByRole('button', { name: /Добавить в/ })).toBeEnabled();
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
                reader_formats: () => ['epub', 'fb2'],
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

    // Отдельная кнопка на каждый формат — без промежуточного диалога.
    await expect(library.getByRole('button', { name: /Добавить EPUB/ })).toBeVisible();
    await expect(library.getByRole('button', { name: /Добавить FB2/ })).toBeVisible();
    await library.getByRole('button', { name: /Добавить EPUB/ }).click();

    // Затем — выбор рабочего места (его ещё нет).
    const picker = page.getByTestId('workspace-picker-item');
    if (await picker.first().isVisible().catch(() => false)) {
        await picker.first().click();
    }
    await expect(page.getByTestId('workplace-tab')).toHaveText('Книга в двух читаемых');
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
