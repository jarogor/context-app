import { expect, test } from '@playwright/test';
import { openWorkspaceArea } from './workplace-area';

/** Ответ активной библиотеки для сценариев заметок. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
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
  await openWorkspaceArea(page);
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
  const back = library.getByRole('button', { name: /К списку книг/ });
  if ((await back.count()) > 0) {
    await back.click();
  }
  await library.getByRole('button', { name: new RegExp(title) }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  await expect(page.getByTestId('workplace-area')).toBeVisible();
}

/** Открытие панели заметок в рабочем месте. */
async function openNotes(page: import('@playwright/test').Page) {
  await page.getByTestId('workplace-notes-toggle').click();
  await expect(page.getByTestId('notes-panel')).toBeVisible();
}

/** Открытие раздела «Заметки» (реестр) из меню разделов. */
async function openNotesRegistry(page: import('@playwright/test').Page) {
  await page.getByTestId('nav-notes').click();
  await expect(page.getByTestId('notes-library')).toBeVisible();
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
    .locator('iframe[title="Содержимое книги"]')
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
  // Палитра меню создания — пять цветов, без чёрного.
  await expect(
    page.getByTestId('quote-menu').locator('button[data-testid^="note-color-"]'),
  ).toHaveCount(5);
  await expect(page.getByTestId('quote-menu').getByTestId('note-color-black')).toHaveCount(0);
  await expect(page.getByTestId('quote-menu').getByTestId('note-color-purple')).toBeVisible();

  // Палитра одной высоты с соседней иконочной кнопкой: контролы базового
  // размера не должны выглядеть разного масштаба.
  const paletteBox = await page.getByTestId('note-color-picker').boundingBox();
  const cancelBox = await page
    .getByTestId('quote-menu')
    .getByRole('button', { name: 'Отмена' })
    .boundingBox();
  expect(Math.abs(paletteBox!.height - cancelBox!.height)).toBeLessThanOrEqual(1);

  // Отмена — иконочная кнопка с доступным именем «Отмена»: крестик есть,
  // текстовой подписи внутри нет.
  const cancel = page.getByTestId('quote-menu').getByRole('button', { name: 'Отмена' });
  await expect(cancel.locator('svg')).toBeVisible();
  await expect(cancel).toHaveText('');

  await cancel.click();

  // Отмена убирает меню и не создаёт заметку.
  await expect(page.getByTestId('quote-menu')).toHaveCount(0);
  await expect(page.getByTestId('notes-item')).toHaveCount(0);
});

test('меню создания появляется у конца многострочного выделения', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openNotes(page);

  // Выделяем три абзаца: рамка диапазона накрывает всю ширину, и позиция по
  // её левому краю увела бы меню к левому отступу страницы.
  const geometry = await bookDocument(page)
    .locator('body')
    .evaluate((body) => {
      const paragraphs = Array.from(body.querySelectorAll('p')) as HTMLElement[];
      const range = body.ownerDocument.createRange();
      range.setStart(paragraphs[0], 0);
      const last = paragraphs[2].firstChild;
      range.setEnd(last ?? paragraphs[2], last ? (last.textContent?.length ?? 0) : 0);
      const rects = Array.from(range.getClientRects());
      const bounds = range.getBoundingClientRect();
      const selection = body.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      paragraphs[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      const lastRect = rects[rects.length - 1];
      return {
        boundsLeft: bounds.left,
        lastRight: lastRect.right,
        pageLeftPadding: 90,
      };
    });

  await expect(page.getByTestId('quote-menu')).toBeVisible();
  const frameBox = await page
    .locator('[data-testid="workplace-tab-page"][data-active="true"]')
    .locator('iframe[title="Содержимое книги"]')
    .boundingBox();
  const menuBox = await page.getByTestId('quote-menu').boundingBox();
  // Меню стоит у конца выделения (правого края последней строки), а не у
  // левого отступа страницы.
  expect(menuBox!.x).toBeGreaterThan(frameBox!.x + geometry.pageLeftPadding + 100);
  expect(menuBox!.x).toBeLessThanOrEqual(frameBox!.x + geometry.lastRight + 2);
});

test('активное выделение показывает метки только у краёв выделения', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openNotes(page);

  // Выделяем три абзаца, не подтверждая заметку: это живое выделение на
  // несколько строк.
  await bookDocument(page)
    .locator('body')
    .evaluate((body) => {
      const paragraphs = Array.from(body.querySelectorAll('p')) as HTMLElement[];
      const range = body.ownerDocument.createRange();
      range.setStart(paragraphs[0], 0);
      const last = paragraphs[2].firstChild;
      range.setEnd(last ?? paragraphs[2], last ? (last.textContent?.length ?? 0) : 0);
      const selection = body.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      paragraphs[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

  const layer = bookDocument(page).locator('.context-selection-layer');
  await expect(layer).toHaveCount(1);
  // Полосок несколько (по строке), но метки — только у первой и последней.
  const bands = bookDocument(page).locator('.context-selection-band');
  expect(await bands.count()).toBeGreaterThanOrEqual(3);
  const edges = await bookDocument(page)
    .locator('.context-selection-band')
    .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.edge));
  expect(edges[0]).toBe('start');
  expect(edges[edges.length - 1]).toBe('end');
  expect(edges.slice(1, -1).every((edge) => edge === 'none')).toBe(true);

  // Метка — на левом краю первой полосы, и у подсветки заметки её нет.
  // Метка сдвинута наружу от полосы на свою ширину: тогда она попадает в
  // промежуток между буквами, а не ложится на глиф — как в плагине PDF.
  const left = await bookDocument(page)
    .locator('.context-selection-band')
    .first()
    .evaluate((element) => {
      const edge = getComputedStyle(element, '::before');
      return { width: edge.width, left: edge.left };
    });
  expect(left.width).not.toBe('0px');
  expect(Number.parseFloat(left.left)).toBeLessThan(0);

  // Заливка и метки — один элемент слоя, поэтому их высоты совпадают
  // (нативное `::selection` прозрачно: движки красят его по-разному).
  const fill = await bookDocument(page)
    .locator('.context-selection-band')
    .first()
    .evaluate((element) => {
      const band = getComputedStyle(element);
      const edge = getComputedStyle(element, '::before');
      const rect = (element as HTMLElement).getBoundingClientRect();
      return {
        background: band.backgroundColor,
        edgeWidth: edge.width,
        height: rect.height,
      };
    });
  expect(fill.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(Number.parseFloat(fill.edgeWidth)).toBeGreaterThan(0);
  // Полоса расширена до высоты строки — иначе между строками выделения
  // остаются пустоты, которых нет в PDF.
  const lineHeight = await bookDocument(page)
    .locator('p')
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight));
  expect(Math.abs(fill.height - lineHeight)).toBeLessThan(1);

  // Снятие выделения убирает слой и метки.
  await page.getByTestId('quote-menu').getByRole('button', { name: 'Отмена' }).click();
  await expect(bookDocument(page).locator('.context-selection-layer')).toHaveCount(0);
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
    .locator('mark.context-note')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe('rgb(242, 205, 82)');

  // Фон подсветки расширен до высоты строки: иначе между строками заметки
  // остаются щели, которых нет в PDF (там полосы строк уже включают интервал).
  const sizes = await bookDocument(page)
    .locator('mark.context-note')
    .first()
    .evaluate((element) => ({
      markHeight: element.getClientRects()[0]?.height ?? 0,
      lineHeight: Number.parseFloat(getComputedStyle(element.parentElement as Element).lineHeight),
    }));
  expect(Math.abs(sizes.markHeight - sizes.lineHeight)).toBeLessThan(1);
});

test('в тёмной теме фон подсветки непрозрачный, чтобы стык строк не темнел', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openNotes(page);
  await highlightParagraph(page, 'Первый абзац книги.');

  // Тёмная сторона темы области чтения.
  await page
    .getByTestId('reader-theme-toggle')
    .getByRole('button', { name: 'Тёмная тема области чтения' })
    .click();
  await expect(bookDocument(page).locator('html[data-reader-theme="dark"]')).toHaveCount(1);

  const background = await bookDocument(page)
    .locator('mark.context-note')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  // Непрозрачный цвет: перенесённые куски подсветки перекрываются на доли
  // пикселя, и полупрозрачные слои складывали бы альфу в тёмную полосу.
  expect(background).toMatch(/^rgb\(/);
  expect(background).not.toMatch(/rgba\(/);
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
    .locator('mark.context-note')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(blueBackground).toBe('rgb(132, 173, 240)');

  // Смена цвета из меню заметки: полоса и подсветка становятся зелёными.
  await page.getByLabel('Действия с заметкой').first().click();
  await page.getByTestId('menu-color-green').click();

  await expect(page.getByTestId('notes-item')).toHaveAttribute('data-color', 'green');
  const greenBackground = await bookDocument(page)
    .locator('mark.context-note')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(greenBackground).toBe('rgb(130, 217, 145)');
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
    .locator('mark.context-note')
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
  await page.getByTestId('workplace-notes-toggle').click();
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

test('панель чтения — верх области чтения, панели открываются сбоку на всю высоту', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openNotes(page);

  const area = await page.getByTestId('workplace-area').boundingBox();
  const reading = await page.getByTestId('workplace-reading').boundingBox();
  const toolbar = await page.getByTestId('note-toolbar').boundingBox();
  const notes = await page.getByTestId('notes-panel').boundingBox();
  const tabs = await page.getByTestId('workplace-tabs').boundingBox();
  expect(area).not.toBeNull();
  expect(reading).not.toBeNull();
  expect(toolbar).not.toBeNull();
  expect(notes).not.toBeNull();
  expect(tabs).not.toBeNull();

  // Панель чтения принадлежит области чтения: она уже рабочего места, потому
  // что рядом стоит панель заметок.
  expect(Math.abs(toolbar!.width - reading!.width)).toBeLessThanOrEqual(1);
  expect(toolbar!.width).toBeLessThan(area!.width);
  // Она стоит сверху области чтения, а панель заметок — сбоку от неё и во всю
  // её высоту, а не ниже панели. Панели живут слева от области чтения.
  expect(Math.abs(toolbar!.y - reading!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(notes!.y - reading!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(notes!.height - reading!.height)).toBeLessThanOrEqual(1);
  expect(notes!.x + notes!.width).toBeLessThanOrEqual(toolbar!.x + 1);
  // Полоса вкладок остаётся над областью чтения во всю ширину рабочего места.
  expect(Math.abs(tabs!.width - area!.width)).toBeLessThanOrEqual(1);
  expect(tabs!.y + tabs!.height).toBeLessThanOrEqual(toolbar!.y + 1);
});

test('на узком окне панель чтения уходит вниз и раскладывается на две строки', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  const area = await page.getByTestId('workplace-area').boundingBox();
  const toolbar = await page.getByTestId('note-toolbar').boundingBox();
  const zoom = await page.getByTestId('reader-zoom-group').boundingBox();
  const theme = await page.getByTestId('reader-theme-toggle').boundingBox();
  expect(area).not.toBeNull();
  expect(toolbar).not.toBeNull();
  expect(zoom).not.toBeNull();
  expect(theme).not.toBeNull();

  // Панель прижата к низу области рабочего места, а не висит сверху.
  expect(Math.abs(toolbar!.y + toolbar!.height - (area!.y + area!.height))).toBeLessThanOrEqual(1);
  // Управление чтением — в нижней строке панели, под инструментами заметок.
  expect(zoom!.y).toBeGreaterThan(toolbar!.y + toolbar!.height / 2);

  // Всё управление чтением на месте и не выходит за пределы панели.
  for (const name of ['Увеличить масштаб', 'Уменьшить масштаб', 'Тёмная тема области чтения']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  expect(zoom!.x + zoom!.width).toBeLessThanOrEqual(toolbar!.x + toolbar!.width + 1);
  expect(zoom!.y + zoom!.height).toBeLessThanOrEqual(toolbar!.y + toolbar!.height + 1);
});

test('на узком окне полоса вкладок показывает одну активную вкладку без навигации', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  for (let index = 0; index < 3; index += 1) {
    await page
      .locator('[data-testid="workplace-tab-item"]:has([aria-pressed="true"])')
      .getByLabel('Дублировать вкладку')
      .first()
      .click();
  }

  // Видна одна вкладка — активная; навигации по диапазону и счётчика нет.
  await expect(page.getByTestId('workplace-tab-item')).toHaveCount(1);
  await expect(page.getByLabel('Предыдущие вкладки')).toHaveCount(0);
  await expect(page.getByLabel('Следующие вкладки')).toHaveCount(0);
  await expect(page.getByTestId('workplace-tabs-counter')).toHaveCount(0);

  // Остальные вкладки доступны в панели вкладок.
  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  await expect(page.getByTestId('open-books-panel').getByTestId('open-books-item')).toHaveCount(4);
});

test('на узком окне панель заметок — на всю ширину, а выбор заметки закрывает её', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openNotes(page);
  await highlightParagraph(page, 'Первый абзац книги.');

  const area = await page.getByTestId('workplace-area').boundingBox();
  const notes = await page.getByTestId('notes-panel').boundingBox();
  expect(area).not.toBeNull();
  expect(notes).not.toBeNull();
  // Панель заметок занимает всю ширину области рабочего места.
  expect(Math.abs(notes!.width - area!.width)).toBeLessThanOrEqual(1);
  // Единая панель чтения остаётся видимой.
  await expect(page.getByTestId('note-toolbar')).toBeVisible();

  // Переход к заметке в этом режиме закрывает панель, и видно страницу текста.
  await page.getByTestId('notes-item-link').click();
  await expect(page.getByTestId('notes-panel')).toHaveCount(0);
  await expect(page.getByTestId('note-toolbar')).toBeVisible();
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
  if (
    !(await page
      .getByTestId('notes-panel')
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId('workplace-notes-toggle').click();
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
  if (
    !(await page
      .getByTestId('notes-panel')
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId('workplace-notes-toggle').click();
  }
  await expect(page.getByTestId('notes-panel')).toBeVisible();
  await expect(noteSetSelect(page)).toContainText('Наборов нет');

  // Свой набор второй книги не показывается у первой.
  await createNoteSet(page, 'Вторая книга');
  await expect(noteSetSelect(page)).toContainText('Вторая книга');

  await page.getByTestId('workplace-tab').first().click();
  if (
    !(await page
      .getByTestId('notes-panel')
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId('workplace-notes-toggle').click();
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
  if (
    !(await page
      .getByTestId('notes-panel')
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId('workplace-notes-toggle').click();
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
  // Текучее чтение не предлагает текст и фигуру: их точки неустойчивы к потоку.
  await expect(toolbar.getByRole('button', { name: 'Цитата' })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Текст' })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Фигура' })).toHaveCount(0);
  // Единственному типу не нужны ни кнопка выбора, ни палитра цветов: цвет
  // цитаты выбирается в меню создания при выделении. Панель остаётся ради
  // масштаба и переключателя темы области чтения.
  await expect(toolbar.getByTestId('note-tool-color-picker')).toHaveCount(0);
  await expect(page.getByTestId('note-tool-shape')).toHaveCount(0);
  await expect(page.getByTestId('reader-zoom')).toBeVisible();
  await expect(page.getByTestId('reader-theme-toggle')).toBeVisible();
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
  await page
    .getByTestId('notes-item-editor')
    .getByRole('button', { name: 'Удалить комментарий' })
    .click();
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
  const frame = page.frameLocator('iframe[title="Содержимое книги"]');
  await frame.locator('mark.context-note').first().click();
  await expect(page.getByTestId('note-menu')).toBeVisible();
  await page.getByTestId('note-menu').getByRole('button', { name: 'Изменить выделение' }).click();

  // Плашки с подтверждением нет: правка завершается по отпусканию кнопки.
  await expect(page.getByTestId('note-editing-hint')).toHaveCount(0);
  await expect(frame.locator('.context-note-handle')).toHaveCount(2);

  const handle = frame.locator('.context-note-handle[data-note-handle="end"]').first();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + box!.height / 2, { steps: 6 });
  await page.mouse.up();

  // После отпускания маркеры и правка снимаются, цитата остаётся подсвеченной.
  await expect(frame.locator('.context-note-handle')).toHaveCount(0);
  await expect(frame.locator('mark.context-note').first()).toBeVisible();
});

/** Создание заметки в наборе книги и возврат к реестру. */
async function noteInBook(page: import('@playwright/test').Page, book: string, text: string) {
  await addBook(page, book);
  if (
    !(await page
      .getByTestId('notes-panel')
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId('workplace-notes-toggle').click();
  }
  await expect(page.getByTestId('notes-panel')).toBeVisible();
  await highlightParagraph(page, text);
  await expect(page.getByTestId('notes-item-link')).toContainText(text);
}

test('реестр заметок сворачивает заметки набора и раскрывает по клику', async ({ page }) => {
  await page.goto('/');
  // Заметка в первой книге создаёт набор с именем книги.
  await noteInBook(page, 'Демо-книга', 'Первый абзац книги.');
  // Вторая книга со своим набором.
  await noteInBook(page, 'Третья книга', 'Первый абзац книги.');

  await openNotesRegistry(page);

  // В списке видны наборы с книгой-подписью, а не заметки.
  const sets = page.getByTestId('notes-library-set');
  await expect(sets).toHaveCount(2);
  await expect(sets.filter({ hasText: 'Демо-книга' })).toHaveCount(1);
  await expect(sets.filter({ hasText: 'Третья книга' })).toHaveCount(1);
  await expect(page.getByTestId('notes-library-notes')).toHaveCount(0);

  // Раскрытие набора по клику показывает заметки с типом.
  const first = sets.filter({ hasText: 'Демо-книга' });
  await first.getByTestId('notes-library-set-toggle').click();
  const notes = first.getByTestId('notes-library-notes');
  await expect(notes.getByTestId('notes-item-link')).toContainText('Первый абзац книги.');
  await expect(notes.getByTestId('notes-item-type')).toHaveText('Цитата');
});

test('реестр заметок находит записи глобальным поиском', async ({ page }) => {
  await page.goto('/');
  await noteInBook(page, 'Демо-книга', 'Первый абзац книги.');
  await noteInBook(page, 'Третья книга', 'Первый абзац книги.');

  await openNotesRegistry(page);
  await expect(page.getByTestId('notes-library-set')).toHaveCount(2);

  const registry = page.getByTestId('notes-library');
  const search = registry.getByPlaceholder('Поиск по заметкам');

  // Поиск по имени книги оставляет только её.
  await search.fill('Третья книга');
  await expect(page.getByTestId('notes-library-set')).toHaveCount(1);
  await expect(page.getByTestId('notes-library-book')).toContainText('Третья книга');

  // Поиск без совпадений сообщает об этом.
  await search.fill('нет такого');
  await expect(page.getByTestId('notes-library-empty')).toContainText('ничего не найдено');
});

test('реестр заметок ведёт к книге и заметке', async ({ page }) => {
  await page.goto('/');
  await noteInBook(page, 'Демо-книга', 'Второй абзац книги.');

  await openNotesRegistry(page);
  const registry = page.getByTestId('notes-library');
  await registry.getByTestId('notes-library-set-toggle').click();
  await registry.getByTestId('notes-item-link').click();

  // Открылась книга, панель заметок показывает выбранную заметку.
  await expect(page.getByTestId('workplace-area')).toBeVisible();
  await expect(page.getByTestId('workplace-tab').last()).toHaveText('Демо-книга');
  await expect(page.getByTestId('notes-item')).toHaveAttribute('data-selected', 'true');

  await openNotesRegistry(page);
  await expect(page.getByTestId('notes-library-book')).toContainText('Демо-книга');
});

test('реестр заметок перечитывается при изменении хранилища', async ({ page }) => {
  await page.goto('/');
  await openNotesRegistry(page);
  await expect(page.getByTestId('notes-library-empty')).toBeVisible();

  // Заметка в книге меняет хранилище: реестр обновляется по событию.
  await noteInBook(page, 'Демо-книга', 'Первый абзац книги.');
  await openNotesRegistry(page);
  await expect(page.getByTestId('notes-library-book')).toContainText('Демо-книга');
});

test('реестр заметок сообщает о книге набора без файла', async ({ page }) => {
  // Набор без файла-книги: переход из реестра должен сообщить о недоступности.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'context-notes',
      JSON.stringify([
        {
          id: 'ns-missing',
          bookKey: 'no-library',
          bookTitle: 'Без файла',
          name: 'Основные',
          notes: [],
        },
      ]),
    );
  });
  await page.goto('/');

  await openNotesRegistry(page);
  await expect(page.getByTestId('notes-library-book')).toContainText('Без файла');

  await page.getByTestId('notes-library').getByLabel('Действия с набором заметок').click();
  await page.getByRole('menuitem', { name: 'Открыть книгу' }).click();

  // Раздел остаётся открытым и показывает диагностику недоступности.
  await expect(page.getByTestId('notes-library-error')).toContainText('недоступна');
});

test('реестр заметок адаптивен к ширине окна', async ({ page }) => {
  await page.goto('/');
  await noteInBook(page, 'Демо-книга', 'Первый абзац книги.');

  // Узкое окно: реестр не даёт горизонтальной прокрутки и сохраняет поиск.
  await page.setViewportSize({ width: 600, height: 700 });
  await openNotesRegistry(page);
  await expect(
    page.getByTestId('notes-library').getByPlaceholder('Поиск по заметкам'),
  ).toBeVisible();
  const narrow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(narrow).toBe(true);
});

test('заметки находят место по тексту цитаты, когда якорь устарел', async ({ page }) => {
  // Заметки сохранены от прежней разборки книги: номер главы и смещения
  // чужие, а текст цитаты совпадает. Подсветка должна стоять на цитате,
  // переход — вести к ней, а повторный клик — не сдвигать текст.
  const quotes = [
    'Абзац 5. Текст для проверки прокрутки книги.',
    'Абзац 40. Текст для проверки прокрутки книги.',
    'Абзац 55. Текст для проверки прокрутки книги.',
  ];
  await page.addInitScript(
    ({ text, bookKey }) => {
      window.localStorage.setItem(
        'context-notes',
        JSON.stringify([
          {
            id: 'ns-1',
            bookKey,
            bookTitle: 'Демо-книга',
            name: 'Основные',
            notes: text.map((quote, index) => ({
              id: `note-${index}`,
              type: 'quote',
              anchor: JSON.stringify({
                v: 1,
                chapter: 9,
                start: 900_000 + index,
                end: 900_400 + index,
                quote,
                percent: 10 + index * 20,
                page: null,
              }),
              quote,
              chapter: '9',
              title: '',
              comment: '',
              color: 'yellow',
              percent: 10 + index * 20,
              page: null,
              text: '',
              shape: 'line',
              geometry: '',
              created_at_millis: 1_700_000_000_000 + index,
              updated_at_millis: 1_700_000_000_000 + index,
            })),
          },
        ]),
      );
      window.localStorage.setItem('context-notes-active', JSON.stringify({ [bookKey]: 'ns-1' }));
    },
    { text: quotes, bookKey: '/demo-library/demo-1.epub' },
  );

  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openNotes(page);

  // Все три заметки подсвечены на своих цитатах, хотя смещения якоря в них
  // не попадают.
  const marks = bookDocument(page).locator('mark.context-note');
  await expect(marks).toHaveCount(quotes.length);
  expect(await marks.evaluateAll((items) => items.map((item) => item.textContent))).toEqual(quotes);

  const scrollTop = () =>
    bookDocument(page)
      .locator('html')
      .evaluate((element) => {
        const doc = element.ownerDocument;
        const root = doc.scrollingElement ?? doc.documentElement;
        return Math.round(root.scrollTop);
      });
  const scrollToTop = () =>
    bookDocument(page)
      .locator('html')
      .evaluate((element) => {
        const doc = element.ownerDocument;
        const root = doc.scrollingElement ?? doc.documentElement;
        root.scrollTop = 0;
      });

  // Переход к нижней заметке из начала книги.
  await scrollToTop();
  await page.getByTestId('notes-item-link').last().click();
  await expect(marks.last()).toBeInViewport();
  const reached = await scrollTop();
  expect(reached).toBeGreaterThan(0);

  // Повторный клик не сдвигает текст: место уже видно.
  await page.getByTestId('notes-item-link').last().click();
  expect(await scrollTop()).toBe(reached);
});

test('большая книга с устаревшими якорями открывается без зависания', async ({ page }) => {
  // Объём, близкий к реальным книгам: сотни тысяч символов в одной главе и
  // десятки заметок. Поиск места по тексту не должен выполняться на каждую
  // заметку заново — иначе открытие рабочего места зависает.
  await page.addInitScript((active) => {
    const paragraphs = Array.from(
      { length: 8000 },
      (_, index) =>
        `<p>Абзац ${index + 1}. Текст для проверки прокрутки книги, длинная строка набора.</p>`,
    ).join('');
    const quotes = Array.from(
      { length: 10 },
      (_, index) =>
        `Абзац ${400 + index * 700}. Текст для проверки прокрутки книги, длинная строка набора.`,
    );
    window.localStorage.setItem(
      'context-notes',
      JSON.stringify([
        {
          id: 'ns-big',
          bookKey: '/demo-library/demo-1.epub',
          bookTitle: 'Демо-книга',
          name: 'Основные',
          notes: quotes.map((quote, index) => ({
            id: `note-big-${index}`,
            type: 'quote',
            anchor: JSON.stringify({
              v: 1,
              chapter: 9,
              start: 900_000 + index,
              end: 900_400 + index,
              quote,
              percent: 5 + index * 9,
              page: null,
            }),
            quote,
            chapter: '9',
            title: '',
            comment: '',
            color: 'yellow',
            percent: 5 + index * 9,
            page: null,
            text: '',
            shape: 'line',
            geometry: '',
            created_at_millis: 1_700_000_000_000 + index,
            updated_at_millis: 1_700_000_000_000 + index,
          })),
        },
      ]),
    );
    window.localStorage.setItem(
      'context-notes-active',
      JSON.stringify({ '/demo-library/demo-1.epub': 'ns-big' }),
    );
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
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
        reader_content: () => ({
          title: 'Демо-книга',
          authors: ['Тестовый автор'],
          chapters: [
            { title: 'Глава 1', html: '<h1>Глава 1</h1><p>Первый абзац книги.</p>' },
            { title: 'Глава 2', html: `<h2>Глава 2</h2>${paragraphs}` },
          ],
        }),
      },
    };
  }, ACTIVE_LIBRARY);

  const started = Date.now();
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openNotes(page);

  // Все заметки найдены по тексту и подсвечены.
  const marks = bookDocument(page).locator('mark.context-note');
  await expect(marks).toHaveCount(10, { timeout: 15000 });

  // Открытие укладывается в разумное время, а не зависает.
  expect(Date.now() - started).toBeLessThan(30000);
});
