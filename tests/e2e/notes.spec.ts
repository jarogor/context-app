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

/** Выбор инструмента заметок в панели инструментов рабочего места. */
async function selectTool(page: import('@playwright/test').Page, name: string) {
    await page.getByTestId('note-toolbar').getByRole('button', { name }).click();
}

test('текстовая карточка создаётся кликом и отображается в книге', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Текст');
    await page.getByTestId('note-tool-color-black').click();
    await bookDocument(page).locator('.texture-chapter').first().click({ position: { x: 40, y: 30 } });

    const editor = page.getByTestId('text-card-editor');
    await expect(editor).toBeVisible();
    await editor.getByLabel('Текст заметки').fill('Моя мысль');
    await editor.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(page.getByTestId('notes-item-type')).toHaveText('Текст');
    await expect(page.getByTestId('notes-item')).toHaveAttribute('data-color', 'black');
    await expect(bookDocument(page).locator('.texture-note-card').first()).toHaveText('Моя мысль');
});

test('фигура рисуется протяжкой и отображается в книге', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Фигура');
    // Вид фигуры по умолчанию — линия; протяжка в разделе главы.
    const chapter = bookDocument(page).locator('.texture-chapter').first();
    await chapter.dragTo(chapter, {
        sourcePosition: { x: 30, y: 20 },
        targetPosition: { x: 160, y: 90 },
    });

    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(page.getByTestId('notes-item-type')).toHaveText('Фигура');
    await expect(bookDocument(page).locator('.texture-note-shape line')).toHaveCount(1);
});

test('протяжка фигуры показывает предпросмотр и завершается вне области чтения', async ({
    page,
}) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Фигура');
    const chapter = bookDocument(page).locator('.texture-chapter').first();
    const chapterBox = await chapter.boundingBox();
    expect(chapterBox).not.toBeNull();

    // Во время протяжки видна пунктирная рамка будущей фигуры (как в PDF).
    await page.mouse.move(chapterBox!.x + 40, chapterBox!.y + 40);
    await page.mouse.down();
    await page.mouse.move(chapterBox!.x + 120, chapterBox!.y + 90, { steps: 5 });
    await expect(bookDocument(page).locator('.texture-note-preview')).toHaveCount(1);

    // Отпускание за пределами области чтения (на панели заметок) завершает жест:
    // рамка снимается, а фигура создаётся по последней точке внутри книги.
    await page.mouse.move(page.viewportSize()!.width - 10, 300, { steps: 5 });
    await page.mouse.up();
    await expect(bookDocument(page).locator('.texture-note-preview')).toHaveCount(0);
    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(bookDocument(page).locator('.texture-note-shape line')).toHaveCount(1);
});

test('фигура-прямоугольник отображается в книге', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Фигура');
    await page.getByRole('button', { name: 'Вид фигуры' }).click();
    await page.getByRole('option', { name: 'Прямоугольник' }).click();

    const chapter = bookDocument(page).locator('.texture-chapter').first();
    await chapter.dragTo(chapter, {
        sourcePosition: { x: 30, y: 30 },
        targetPosition: { x: 180, y: 110 },
    });

    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    await expect(page.getByTestId('notes-item-type')).toHaveText('Фигура');
    const rect = bookDocument(page).locator('.texture-note-shape rect');
    await expect(rect).toHaveCount(1);
    // Слой фигуры занимает её рамку, а не всю главу: слой во всю высоту главы
    // движок не рисует у больших глав — фигура есть в разметке, но невидима.
    const heightPercent = await bookDocument(page)
        .locator('.texture-note-shape')
        .first()
        .evaluate((element) => parseFloat((element as HTMLElement).style.height));
    expect(heightPercent).toBeLessThan(50);
    // viewBox единичный: крошечный viewBox (доли рамки, масштаб в десятки тысяч)
    // движок тоже не отрисовывает, поэтому координаты нормированы в 0..1.
    await expect(bookDocument(page).locator('.texture-note-shape').first()).toHaveAttribute(
        'viewBox',
        '0 0 1 1',
    );
    // Прямоугольник — полупрозрачная заливка цветом заметки, без обводки.
    await expect(rect).toHaveCSS('fill-opacity', '0.5');
    await expect(rect).toHaveCSS('stroke', 'none');
    const box = await rect.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(50);
    expect(box!.height).toBeGreaterThan(20);
});

test('инструмент фигуры поддерживает прямоугольник и эллипс', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Фигура');
    await page.getByRole('button', { name: 'Вид фигуры' }).click();
    await page.getByRole('option', { name: 'Эллипс' }).click();

    const chapter = bookDocument(page).locator('.texture-chapter').first();
    await chapter.dragTo(chapter, {
        sourcePosition: { x: 20, y: 20 },
        targetPosition: { x: 140, y: 100 },
    });

    await expect(page.getByTestId('notes-item')).toHaveCount(1);
    const ellipse = bookDocument(page).locator('.texture-note-shape ellipse');
    await expect(ellipse).toHaveCount(1);
    // Эллипс — полупрозрачная заливка цветом заметки, без обводки (как цитата).
    await expect(ellipse).toHaveCSS('fill-opacity', '0.5');
    await expect(ellipse).toHaveCSS('stroke', 'none');
    // Фигура ложится умножением (на слое фигуры), как подсветка: текст не выбеливается.
    await expect(bookDocument(page).locator('.texture-note-shape')).toHaveCSS(
        'mix-blend-mode',
        'multiply',
    );

    // Клик по залитой области (не по тонкому контуру) открывает меню фигуры.
    const box = await ellipse.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.getByTestId('note-menu')).toBeVisible();
});

test('типы заметок в книге сохраняются после перезагрузки', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Текст');
    await bookDocument(page).locator('.texture-chapter').first().click({ position: { x: 40, y: 30 } });
    await page.getByTestId('text-card-editor').getByLabel('Текст заметки').fill('Мысль');
    await page.getByTestId('text-card-editor').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

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

    await expect(page.getByTestId('notes-item-type')).toHaveText('Текст');
    await expect(bookDocument(page).locator('.texture-note-card').first()).toHaveText('Мысль');
});

test('текстовую карточку можно переместить через контекстное меню', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Текст');
    await bookDocument(page).locator('.texture-chapter').first().click({ position: { x: 40, y: 30 } });
    await page.getByTestId('text-card-editor').getByLabel('Текст заметки').fill('Сдвинь меня');
    await page.getByTestId('text-card-editor').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    const card = bookDocument(page).locator('.texture-note-card').first();
    const before = await card.evaluate((element) => element.style.left);
    await card.click();
    // Клик по существующей карточке (инструмент «текст» уже активен) выбирает
    // её, но не открывает редактор новой заметки.
    await expect(page.getByTestId('note-menu')).toBeVisible();
    await expect(page.getByTestId('text-card-editor')).toHaveCount(0);
    await page.getByTestId('note-menu').getByRole('button', { name: 'Переместить' }).click();
    // В режиме перемещения показаны направляющие осей, совпадающие с карточкой.
    const guide = page.getByTestId('note-move-guide');
    await expect(guide).toBeVisible();
    const guideBox = await guide.boundingBox();
    const cardBox = await card.boundingBox();
    expect(guideBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect(Math.abs(guideBox!.y - cardBox!.y)).toBeLessThan(2);
    // Рамка направляющих не выходит за карточку ни по одной стороне.
    expect(Math.abs(guideBox!.width - cardBox!.width)).toBeLessThan(2);
    expect(Math.abs(guideBox!.height - cardBox!.height)).toBeLessThan(2);

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 5, box!.y + 5);
    await page.mouse.down();
    // Во время протяжки заметка следует за курсором, а не ждёт сохранения.
    await page.mouse.move(box!.x + 35, box!.y + 25);
    const during = await card.boundingBox();
    expect(during).not.toBeNull();
    expect(during!.x - cardBox!.x).toBeGreaterThan(10);
    await page.mouse.move(box!.x + 65, box!.y + 45, { steps: 6 });
    await page.mouse.up();

    await expect
        .poll(async () => card.evaluate((element) => element.style.left))
        .not.toBe(before);
});

test('клик по заметке переключает инструмент на её тип и позволяет переместить', async ({
    page,
}) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    // Создаём текстовую карточку, затем переключаемся на инструмент фигуры.
    await selectTool(page, 'Текст');
    await bookDocument(page).locator('.texture-chapter').first().click({ position: { x: 40, y: 30 } });
    await page.getByTestId('text-card-editor').getByLabel('Текст заметки').fill('Сдвинь');
    await page.getByTestId('text-card-editor').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    await selectTool(page, 'Фигура');
    const shapeButton = page.getByTestId('note-toolbar').getByRole('button', { name: 'Фигура' });
    await expect(shapeButton).toHaveAttribute('aria-pressed', 'true');

    const card = bookDocument(page).locator('.texture-note-card').first();
    await card.click();
    // Инструмент следует за типом заметки: карточка переводит панель в «Текст».
    const textButton = page.getByTestId('note-toolbar').getByRole('button', { name: 'Текст' });
    await expect(textButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('note-menu')).toBeVisible();

    await page.getByTestId('note-menu').getByRole('button', { name: 'Переместить' }).click();
    await expect(page.getByTestId('note-move-guide')).toBeVisible();

    const before = await card.evaluate((element) => element.style.left);
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 5, box!.y + 5);
    await page.mouse.down();
    await page.mouse.move(box!.x + 60, box!.y + 40, { steps: 6 });
    await page.mouse.up();

    await expect.poll(async () => card.evaluate((element) => element.style.left)).not.toBe(before);
});

test('границы цитаты сдвигаются через контекстное меню', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Цитата');
    await highlightParagraph(page, 'Первый абзац книги.');

    const mark = bookDocument(page).locator('mark.texture-note').first();
    await mark.click();
    await expect(page.getByTestId('note-menu')).toBeVisible();
    await page.getByTestId('note-menu').getByRole('button', { name: 'Изменить выделение' }).click();
    await expect(page.getByTestId('note-editing-hint')).toBeVisible();
    await expect(bookDocument(page).locator('.texture-note-handle')).toHaveCount(2);
});

test('фигуру можно выбрать и переместить через контекстное меню', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Фигура');
    // Диагональная линия: её середина лежит на контуре, поэтому клик по центру
    // мишени попадает по фигуре.
    const chapter = bookDocument(page).locator('.texture-chapter').first();
    await chapter.dragTo(chapter, {
        sourcePosition: { x: 40, y: 40 },
        targetPosition: { x: 220, y: 120 },
    });
    await expect(page.getByTestId('notes-item')).toHaveCount(1);

    const shape = bookDocument(page).locator('.texture-note-shape').first();
    await shape.locator('path').click();
    await expect(page.getByTestId('note-menu')).toBeVisible();
    await page.getByTestId('note-menu').getByRole('button', { name: 'Переместить' }).click();
    // Направляющие перемещения показывают, что фигура готова к перетаскиванию
    // и совпадают с положением фигуры (раньше они были смещены вверх).
    const guide = page.getByTestId('note-move-guide');
    await expect(guide).toBeVisible();
    const lineBox = await shape.locator('line').boundingBox();
    const guideBox = await guide.boundingBox();
    expect(guideBox).not.toBeNull();
    expect(lineBox).not.toBeNull();
    expect(Math.abs(guideBox!.y - lineBox!.y)).toBeLessThan(4);

    const line = shape.locator('line');
    const beforeLeft = await shape.evaluate((el) => (el as HTMLElement).style.left);
    const box = await line.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 50, box!.y + box!.height / 2 + 30, { steps: 6 });
    await page.mouse.up();

    // Перемещение смещает слой фигуры: координаты внутри слоя нормированы, и
    // положение задаётся рамкой слоя, а не атрибутами фигуры.
    await expect
        .poll(async () => shape.evaluate((el) => (el as HTMLElement).style.left))
        .not.toBe(beforeLeft);
});

test('меню заметки закрывается при клике в списке заметок', async ({ page }) => {
    await page.goto('/');
    await addBook(page, 'Демо-книга');
    await openNotes(page);

    await selectTool(page, 'Цитата');
    await highlightParagraph(page, 'Первый абзац книги.');
    await selectTool(page, 'Текст');
    await bookDocument(page).locator('.texture-chapter').first().click({ position: { x: 40, y: 30 } });
    await page.getByTestId('text-card-editor').getByLabel('Текст заметки').fill('Вторая');
    await page.getByTestId('text-card-editor').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('notes-item')).toHaveCount(2);

    const card = bookDocument(page).locator('.texture-note-card').first();
    await card.click();
    await expect(page.getByTestId('note-menu')).toBeVisible();

    // Взаимодействие вне меню (заметка в списке) закрывает его.
    await page.getByTestId('notes-item-link').first().click();
    await expect(page.getByTestId('note-menu')).toHaveCount(0);
});
