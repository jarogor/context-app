import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев заметок. */
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
                        const registry = (payload as { workspaces?: unknown })?.workspaces;
                        window.localStorage.setItem('workspaces', JSON.stringify(registry));
                        return { ok: true };
                    },
                },
            };
    }, ACTIVE_LIBRARY);
});

/** Открытие рабочего места из списка. */
async function openWorkspace(page: import('@playwright/test').Page) {
    const workspace = page.getByLabel('Рабочее место', { exact: true });
    if ((await workspace.getAttribute('aria-pressed')) !== 'true') {
        await workspace.click();
    }
    const list = page.getByTestId('workspaces-page');
    if (await list.isVisible().catch(() => false)) {
        const open = page.getByTestId('workspace-open').first();
        await open.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
        if (await open.isVisible().catch(() => false)) {
            await open.click();
        }
    }
}

/** Добавление книги вкладкой в рабочее место. */
async function addBook(page: import('@playwright/test').Page, title: string) {
    await openWorkspace(page);
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

/** Открытие панели заметок. */
async function openNotes(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Заметки' }).click();
    await expect(page.getByTestId('notes-panel')).toBeVisible();
}

/** Триггер выпадающего списка наборов заметок. */
function noteSetSelect(page: import('@playwright/test').Page) {
    return page.getByRole('button', { name: 'Набор заметок' });
}

/** Выбор набора заметок в выпадающем списке. */
async function selectNoteSet(page: import('@playwright/test').Page, name: string) {
    await noteSetSelect(page).click();
    await page.getByRole('option', { name: new RegExp(name) }).click();
}

/** Открытие списка наборов и проверка набора доступных вариантов. */
async function expectNoteSetOptions(
    page: import('@playwright/test').Page,
    expected: string[],
    absent: string[] = [],
) {
    await noteSetSelect(page).click();
    for (const name of expected) {
        await expect(page.getByRole('option', { name: new RegExp(name) })).toHaveCount(1);
    }
    for (const name of absent) {
        await expect(page.getByRole('option', { name: new RegExp(name) })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
}

/** Документ активной вкладки в области чтения.
 *
 * Открытые вкладки остаются смонтированными (переключение не перезагружает
 * книгу), поэтому документ адресуется странице активной вкладки.
 */
function bookDocument(page: import('@playwright/test').Page) {
    return page
        .locator('[data-testid="workplace-tab-page"][data-active="true"]')
        .locator('iframe[title="Чтение книги"]')
        .contentFrame();
}

/** Выделение абзаца демо-книги и подтверждение создания заметки. */
async function highlightParagraph(page: import('@playwright/test').Page, text: string) {
    const paragraph = bookDocument(page).getByText(text);
    await paragraph.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const selection = element.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.getByTestId('quote-menu')).toBeVisible();
    await page.getByTestId('quote-menu').getByTestId('note-color-yellow').click();
    // Создание заметки асинхронно. Дожидаемся её появления, иначе следующий шаг
    // (например, перезагрузка страницы) прервёт незавершённую запись, и заметка
    // не сохранится.
    await expect(page.getByTestId('notes-item-link').filter({ hasText: text }).first()).toBeVisible();
}

test('выделение показывает меню создания и отмены', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    const paragraph = bookDocument(page).getByText('Первый абзац книги.');
    await paragraph.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const selection = element.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    await expect(page.getByTestId('quote-menu')).toBeVisible();
    await page.getByTestId('quote-menu').getByRole('button', { name: 'Отмена' }).click();

    // Отмена убирает меню и не создаёт заметку.
    await expect(page.getByTestId('quote-menu')).toHaveCount(0);
    await expect(page.getByTestId('notes-item')).toHaveCount(0);
});

test('панель заметок показывает пустое состояние без книги', async ({ page }) => {
    await page.goto('/');
    await openWorkspace(page);
    await openNotes(page);

    await expect(page.getByTestId('notes-panel-empty')).toBeVisible();
});

test('подсветка заметки-абзаца видна в тексте', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await highlightParagraph(page, 'Первый абзац книги.');

    const background = await bookDocument(page)
        .locator('mark.texture-note')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).toBe('rgb(253, 230, 138)');
});

test('выделение текста создаёт заметку-цитату с подсветкой', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await highlightParagraph(page, 'Первый абзац книги.');

    await expect(page.getByTestId('notes-item-link')).toContainText('Первый абзац книги.');
    const highlighted = bookDocument(page).locator('mark').first();
    await expect(highlighted).toHaveText('Первый абзац книги.');
});

test('создание заметки с выбранным цветом и смена цвета', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    // Создаём заметку синим цветом: подсветка и полоса записи — синие.
    const paragraph = bookDocument(page).getByText('Первый абзац книги.');
    await paragraph.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const selection = element.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.getByTestId('quote-menu')).toBeVisible();
    await page.getByTestId('quote-menu').getByTestId('note-color-blue').click();
    await expect(page.getByTestId('notes-item-link')).toContainText('Первый абзац книги.');

    await expect(page.getByTestId('notes-item')).toHaveAttribute('data-color', 'blue');
    const blueBackground = await bookDocument(page)
        .locator('mark.texture-note')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(blueBackground).toBe('rgb(191, 219, 254)');

    // Смена цвета из меню заметки: полоса и подсветка становятся зелёными.
    await page.getByLabel('Действия с заметкой').first().click();
    await page.getByTestId('menu-color-green').click();

    await expect(page.getByTestId('notes-item')).toHaveAttribute('data-color', 'green');
    const greenBackground = await bookDocument(page)
        .locator('mark.texture-note')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(greenBackground).toBe('rgb(187, 247, 208)');
});

test('подсветка заметок разных цветов видна одновременно', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await highlightParagraph(page, 'Первый абзац книги.');

    const paragraph = bookDocument(page).getByText('Второй абзац книги.');
    await paragraph.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const selection = element.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.getByTestId('quote-menu').getByTestId('note-color-purple').click();
    await expect(page.getByTestId('notes-item')).toHaveCount(2);

    const colors = await bookDocument(page)
        .locator('mark.texture-note')
        .evaluateAll((marks) => marks.map((mark) => mark.getAttribute('data-color')));
    expect(colors).toContain('yellow');
    expect(colors).toContain('purple');
});

test('заметки идут по расположению в книге, а не по времени добавления', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    // Сначала заметка ниже по тексту, затем выше: в списке верхняя должна быть первой.
    await highlightParagraph(page, 'Второй абзац книги.');
    await highlightParagraph(page, 'Первый абзац книги.');

    const links = page.getByTestId('notes-item-link');
    await expect(links).toHaveCount(2);
    await expect(links.first()).toContainText('Первый абзац книги.');
    await expect(links.last()).toContainText('Второй абзац книги.');
});

test('выделение восстанавливается после перезагрузки страницы', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    // Дожидаемся сохранения реестра: перезагрузка до записи восстановила бы
    // рабочее место без вкладки.
    await expect
        .poll(async () => {
            const raw = await page.evaluate(() => window.localStorage.getItem('workspaces'));
            const registry = raw ? JSON.parse(raw) : null;
            return registry?.workspaces?.[0]?.tabs?.length ?? 0;
        })
        .toBe(1);

    await page.reload();
    await openWorkspace(page);
    await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
    await openNotes(page);

    await expect(bookDocument(page).locator('mark').first()).toHaveText('Первый абзац книги.');
    await expect(page.getByTestId('notes-item')).toHaveCount(1);
});

test('меню заметки закрывается при снятии выделения', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    const paragraph = bookDocument(page).getByText('Первый абзац книги.');
    await paragraph.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const selection = element.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.getByTestId('quote-menu')).toBeVisible();

    // Щелчок мимо снимает выделение — меню закрывается.
    await paragraph.evaluate((element) => {
        element.ownerDocument.getSelection()?.removeAllRanges();
    });

    await expect(page.getByTestId('quote-menu')).toHaveCount(0);
});

test('клик по подсветке открывает панель заметок и выбирает заметку', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    // Панель закрыта, книга видна.
    await page.getByRole('button', { name: 'Заметки' }).click();
    await expect(page.getByTestId('notes-panel')).toHaveCount(0);

    await bookDocument(page).locator('mark').first().click();

    await expect(page.getByTestId('notes-panel')).toBeVisible();
    await expect(page.getByTestId('notes-item')).toHaveAttribute('data-selected', 'true');
});

test('клик по заметке ведёт к выделению в книге', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Второй абзац книги.');

    await page.getByTestId('notes-item-link').click();

    await expect(bookDocument(page).locator('mark').first()).toHaveText('Второй абзац книги.');
});

test('удаление заметки убирает подсветку из книги', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    await page.getByLabel('Действия с заметкой').first().click();
    await page.getByRole('menuitem', { name: 'Удалить' }).click();

    await expect(page.getByTestId('notes-item')).toHaveCount(0);
    await expect(bookDocument(page).locator('mark')).toHaveCount(0);
});

test('заметки книги общие для двух вкладок', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await page.getByLabel('Дублировать вкладку').click();
    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);

    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    await page.getByTestId('workplace-tab').first().click();
    await expect(bookDocument(page).locator('mark').first()).toHaveText('Первый абзац книги.');
});

/** Создание набора заметок с указанным именем; он становится активным. */
async function createNoteSet(page: import('@playwright/test').Page, name: string) {
    await page.getByLabel('Действия с набором заметок').click();
    await page.getByRole('menuitem', { name: 'Новый набор' }).click();
    await page.getByPlaceholder('Новый набор').fill(name);
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect(noteSetSelect(page)).toContainText(name);
}

test('переключение набора меняет список и изолирует заметки', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await createNoteSet(page, 'Конспект');
    await highlightParagraph(page, 'Первый абзац книги.');
    await expect(page.getByTestId('notes-item-link')).toContainText('Первый абзац книги.');
    await expect(bookDocument(page).locator('mark')).toHaveCount(1);

    // Новый набор пуст: ни заметок в списке, ни подсветок в книге.
    await createNoteSet(page, 'Черновик');
    await expect(page.getByTestId('notes-item')).toHaveCount(0);
    await expect(bookDocument(page).locator('mark')).toHaveCount(0);

    await highlightParagraph(page, 'Второй абзац книги.');
    await expect(page.getByTestId('notes-item-link')).toContainText('Второй абзац книги.');

    // Возврат к первому набору показывает только его заметку и подсветку.
    await selectNoteSet(page, 'Конспект');
    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(page.getByTestId('notes-item-link')).toContainText('Первый абзац книги.');
    await expect(bookDocument(page).locator('mark').first()).toHaveText('Первый абзац книги.');
});

test('активный набор книги сохраняется при переключении вкладок', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await createNoteSet(page, 'Конспект');
    await highlightParagraph(page, 'Первый абзац книги.');
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    // Созданный позже пустой набор становится активным.
    await createNoteSet(page, 'Черновик');
    await expect(page.getByTestId('notes-item')).toHaveCount(0);

    // Переключение на другую книгу и обратно не сбрасывает выбор набора.
    await addBook(page, 'Третья книга');
    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);

    await page.getByTestId('workplace-tab').first().click();
    if (!(await page.getByTestId('notes-panel').isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Заметки' }).click();
    }

    await expect(noteSetSelect(page)).toContainText('Черновик');
    await expect(page.getByTestId('notes-item')).toHaveCount(0);
    await expect(bookDocument(page).locator('mark')).toHaveCount(0);
});

test('наборы одной книги не появляются у другой книги', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await createNoteSet(page, 'Конспект');

    // Вторая книга: наборов у неё ещё нет, чужие наборы показываться не должны.
    await addBook(page, 'Третья книга');
    await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
    if (!(await page.getByTestId('notes-panel').isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Заметки' }).click();
    }
    await expect(page.getByTestId('notes-panel')).toBeVisible();
    await expect(noteSetSelect(page)).toContainText('Наборов нет');

    // Свой набор второй книги не показывается у первой.
    await createNoteSet(page, 'Вторая книга');
    await expect(noteSetSelect(page)).toContainText('Вторая книга');

    await page.getByTestId('workplace-tab').first().click();
    if (!(await page.getByTestId('notes-panel').isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Заметки' }).click();
    }
    await expectNoteSetOptions(page, ['Конспект'], ['Вторая книга']);
});

test('активный набор книги сохраняется после перезапуска', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await createNoteSet(page, 'Конспект');
    await createNoteSet(page, 'Черновик');
    await highlightParagraph(page, 'Второй абзац книги.');
    await expect(noteSetSelect(page)).toContainText('Черновик');

    // Перезапуск приложения: активным должен остаться выбранный набор книги.
    await page.reload();
    await openWorkspace(page);
    if (!(await page.getByTestId('notes-panel').isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Заметки' }).click();
    }

    await expect(noteSetSelect(page)).toContainText('Черновик');
    await expect(page.getByTestId('notes-item-link')).toContainText('Второй абзац книги.');
});

test('создание, переименование и удаление набора', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await createNoteSet(page, 'Конспект');
    await createNoteSet(page, 'Черновик');

    // Переименование активного набора.
    await page.getByLabel('Действия с набором заметок').click();
    await page.getByRole('menuitem', { name: 'Переименовать' }).click();
    await page.getByPlaceholder('Новое имя').fill('Наброски');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(noteSetSelect(page)).toContainText('Наброски');

    // Удаление активного набора переводит на оставшийся.
    await page.getByLabel('Действия с набором заметок').click();
    await page.getByRole('menuitem', { name: 'Удалить' }).click();
    await expect(noteSetSelect(page)).toContainText('Конспект');
    await expectNoteSetOptions(page, ['Конспект'], ['Наброски']);
});

test('в EPUB доступен только инструмент «цитата»', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    const toolbar = page.getByTestId('note-toolbar');
    await expect(toolbar.getByRole('button', { name: 'Цитата' })).toBeVisible();
    // Текучее чтение не предлагает текст и фигуру: их точки неустойчивы к потоку.
    await expect(toolbar.getByRole('button', { name: 'Текст' })).toHaveCount(0);
    await expect(toolbar.getByRole('button', { name: 'Фигура' })).toHaveCount(0);
    await expect(page.getByTestId('note-tool-shape')).toHaveCount(0);
});

test('название и комментарий заметки правятся в панели и переживают перезагрузку', async ({
    page,
}) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    // Пункт «Изменить» разворачивает форму названия и комментария.
    await page.getByLabel('Действия с заметкой').first().click();
    await page.getByRole('menuitem', { name: 'Изменить' }).click();
    await page.getByLabel('Название заметки').fill('Тезис о тексте');
    await page.getByLabel('Комментарий заметки').fill('Разобрать позже');
    await page.getByTestId('notes-item-editor').getByRole('button', { name: 'Сохранить' }).click();

    // Название вытесняет цитату в имени записи, комментарий виден отдельной строкой.
    await expect(page.getByTestId('notes-item-link')).toContainText('Тезис о тексте');
    await expect(page.getByTestId('notes-item-comment')).toHaveText('Разобрать позже');

    await expect
        .poll(async () => {
            const raw = await page.evaluate(() => window.localStorage.getItem('workspaces'));
            const registry = raw ? JSON.parse(raw) : null;
            return registry?.workspaces?.[0]?.tabs?.length ?? 0;
        })
        .toBe(1);

    await page.reload();
    await openWorkspace(page);
    await openNotes(page);

    await expect(page.getByTestId('notes-item-link')).toContainText('Тезис о тексте');
    await expect(page.getByTestId('notes-item-comment')).toHaveText('Разобрать позже');
});

test('в списке виден тип заметки и начало цитаты', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    // Название не задано: имя — это цитата, отдельного повтора нет.
    await expect(page.getByTestId('notes-item-type')).toHaveText('Цитата');
    await expect(page.getByTestId('notes-item-preview')).toHaveCount(0);

    // После задания названия цитата остаётся видна отдельной строкой.
    await page.getByLabel('Действия с заметкой').first().click();
    await page.getByRole('menuitem', { name: 'Изменить' }).click();
    await page.getByLabel('Название заметки').fill('Тезис');
    await page.getByTestId('notes-item-editor').getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByTestId('notes-item-link')).toContainText('Тезис');
    await expect(page.getByTestId('notes-item-preview')).toContainText('Первый абзац книги.');
});

test('комментарий заметки можно удалить из формы правки', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    await page.getByLabel('Действия с заметкой').first().click();
    await page.getByRole('menuitem', { name: 'Изменить' }).click();
    await page.getByLabel('Комментарий заметки').fill('Временный');
    await page.getByTestId('notes-item-editor').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item-comment')).toHaveText('Временный');

    // Кнопка «Удалить комментарий» очищает поле, заметка остаётся.
    await page.getByLabel('Действия с заметкой').first().click();
    await page.getByRole('menuitem', { name: 'Изменить' }).click();
    await page.getByTestId('notes-item-editor').getByRole('button', { name: 'Удалить комментарий' }).click();
    await page.getByTestId('notes-item-editor').getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(page.getByTestId('notes-item-comment')).toHaveCount(0);
});

test('при малой высоте окна форма правки остаётся доступной', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 420 });
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    await page.getByLabel('Действия с заметкой').first().click();
    await page.getByRole('menuitem', { name: 'Изменить' }).click();

    // Форма не сжата и не обрезана: её кнопки видны и попадают в область панели.
    const save = page.getByTestId('notes-item-editor').getByRole('button', { name: 'Сохранить' });
    await expect(save).toBeVisible();
    const box = await save.boundingBox();
    const panel = await page.getByTestId('notes-panel').boundingBox();
    expect(box).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(panel!.y + panel!.height + 1);
});

test('границы цитаты в EPUB применяются по отпусканию маркера', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);
    await highlightParagraph(page, 'Первый абзац книги.');

    // Меню заметки (общий компонент) открывает правку границ.
    const frame = page.frameLocator('iframe[title="Чтение книги"]');
    await frame.locator('mark.texture-note').first().click();
    await expect(page.getByTestId('note-menu')).toBeVisible();
    await page.getByTestId('note-menu').getByRole('button', { name: 'Изменить выделение' }).click();

    // Плашки с подтверждением нет: правка завершается по отпусканию кнопки.
    await expect(page.getByTestId('note-editing-hint')).toHaveCount(0);
    await expect(frame.locator('.texture-note-handle')).toHaveCount(2);

    const handle = frame.locator('.texture-note-handle[data-note-handle="end"]').first();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + box!.height / 2, { steps: 6 });
    await page.mouse.up();

    // После отпускания маркеры и правка снимаются, цитата остаётся подсвеченной.
    await expect(frame.locator('.texture-note-handle')).toHaveCount(0);
    await expect(frame.locator('mark.texture-note').first()).toBeVisible();
});
