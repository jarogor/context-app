import { expect, test } from '@playwright/test';
import { openWorkspaceArea } from './workplace-area';
import { mockFlowingBook } from './plugin-viewer';

/** Глава с оформлением в классах — как у книги после конвертации в calibre. */
const CHAPTER = `<style>.calibre1{font-size:2.2em;text-align:center;margin:1em 0}
.calibre2{text-indent:1.5em;margin:0}
.calibre3{font-size:1.6em}</style>
<h1 class="calibre1">Заголовок главы</h1>
<p class="calibre2">Абзац с <em>курсивом</em> и <strong>жирным</strong>.</p>
<h2 class="calibre3">Раздел</h2>
<p class="calibre2">Второй абзац книги.</p>
<blockquote><p>Цитата из книги.</p></blockquote>
<ul><li>Пункт списка</li></ul>`;

test.beforeEach(async ({ page }) => {
  // Оформление проверяется на книге, нарисованной плагином формата: текст
  // живёт в песочнице плагина, а не в компоненте оболочки.
  await mockFlowingBook(page, 'epub', [{ title: 'Глава 1', html: CHAPTER }]);
});

/** Открытие книги EPUB вкладкой рабочего места. */
async function openBook(page: import('@playwright/test').Page) {
  await page.goto('/');
  await openWorkspaceArea(page);
  const list = page.getByTestId('workspaces-page');
  if (await list.isVisible().catch(() => false)) {
    const open = page.getByTestId('workspace-open').first();
    if (await open.isVisible().catch(() => false)) {
      await open.click();
    }
  }
  await page.getByRole('button', { name: /Добавить книгу/ }).click();
  const library = page.locator('main');
  const back = library.getByRole('button', { name: /К списку книг/ });
  if ((await back.count()) > 0) {
    await back.click();
  }
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  const picker = page.getByTestId('workspace-picker-item');
  if (await picker.count()) {
    await picker.first().click();
  }
}

/** Область содержимого книги. */
function content(page: import('@playwright/test').Page) {
  return page.frameLocator('iframe[title="Содержимое книги"]');
}

test('книга EPUB показывает оформление из классов главы', async ({ page }) => {
  await openBook(page);
  const frame = content(page);
  await expect(frame.locator('h1')).toBeVisible();

  const sizes = await frame.locator('body').evaluate((body) => {
    const doc = body.ownerDocument;
    const size = (selector: string) => {
      const element = doc.querySelector(selector) as HTMLElement | null;
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
    };
    return {
      body: size('body'),
      h1: size('h1'),
      h2: size('h2'),
      paragraph: size('p'),
    };
  });
  // Заголовок крупнее текста: раньше книга выглядела ровным текстом.
  expect(sizes.h1).toBeGreaterThan(sizes.paragraph * 1.5);
  expect(sizes.h2).toBeGreaterThan(sizes.paragraph);
  expect(sizes.h2).toBeLessThan(sizes.h1);
  expect(sizes.paragraph).toBeGreaterThan(0);
});

test('заголовки разной величины и цитата оформлены без CSS книги', async ({ page }) => {
  // Книга без оформления: типографику задаёт читалка. Подменяется только
  // содержимое книги — модуль рисования остаётся настоящим.
  await mockFlowingBook(page, 'epub', [
    {
      title: 'Глава',
      html: '<h1>Первый</h1><h2>Второй</h2><h3>Третий</h3><p>Абзац текста.</p><blockquote><p>Цитата.</p></blockquote>',
    },
  ]);
  await openBook(page);
  const frame = content(page);
  await expect(frame.locator('h1')).toBeVisible();

  const sizes = await frame.locator('body').evaluate((body) => {
    const doc = body.ownerDocument;
    const size = (selector: string) => {
      const element = doc.querySelector(selector) as HTMLElement | null;
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
    };
    const quote = doc.querySelector('blockquote') as HTMLElement | null;
    return {
      h1: size('h1'),
      h2: size('h2'),
      h3: size('h3'),
      paragraph: size('p'),
      quoteStyle: quote ? getComputedStyle(quote).fontStyle : '',
    };
  });
  expect(sizes.h1).toBeGreaterThan(sizes.h2);
  expect(sizes.h2).toBeGreaterThan(sizes.h3);
  expect(sizes.h3).toBeGreaterThan(sizes.paragraph);
  expect(sizes.quoteStyle).toBe('italic');
});

test('переключатель меняет шрифт книги с засечками на без засечек', async ({ page }) => {
  await openBook(page);
  const frame = content(page);
  await expect(frame.locator('h1')).toBeVisible();

  const family = () => frame.locator('body').evaluate((body) => getComputedStyle(body).fontFamily);
  const serif = await family();
  expect(serif.toLowerCase()).toContain('georgia');

  await page.getByRole('button', { name: 'Шрифт без засечек' }).click();
  await expect.poll(family).not.toBe(serif);
  const sans = await family();
  expect(sans.toLowerCase()).toContain('system-ui');
  // Текст книги остаётся на месте: смена шрифта не пересобирает содержимое.
  await expect(frame.locator('h1')).toBeVisible();
});

test('выбор шрифта книги сохраняется в настройках и применяется ко всем вкладкам', async ({
  page,
}) => {
  await openBook(page);
  await expect(content(page).locator('h1')).toBeVisible();
  await page.getByRole('button', { name: 'Шрифт без засечек' }).click();

  // Значение проходит через настройки и возвращается событием: корень
  // документа книги и интерфейса получают атрибут выбранной гарнитуры.
  await expect(page.locator('html')).toHaveAttribute('data-reader-font', 'sans');
  await expect
    .poll(async () =>
      content(page)
        .locator('html')
        .evaluate((element) => element.getAttribute('data-reader-font')),
    )
    .toBe('sans');
  // Кнопка теперь называет шрифт, на который переключает, — значит выбран sans.
  await expect(page.getByRole('button', { name: 'Шрифт с засечками' })).toBeVisible();
});

// Издательский CSS часто снимает поля `body`, и текст прижимался к левому краю
// области чтения. Поля и ширина колонки принадлежат читалке, а не книге.
test('текст книги не прижимается к левому краю из-за CSS книги', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as unknown as {
      __TEXTURE_MOCK_OVERRIDES__?: { handlers?: Record<string, unknown> };
    };
    const overrides = target.__TEXTURE_MOCK_OVERRIDES__ ?? {};
    overrides.handlers = {
      ...(overrides.handlers ?? {}),
      reader_content: () => ({
        title: 'Книга',
        authors: [],
        chapters: [
          {
            title: 'Глава',
            html: '<style>@page{margin:0}body{margin:0;padding:0;max-width:none}.calibre{margin:0;padding:0}</style><div class="calibre"><h1>Заголовок</h1><p>Первый абзац книги.</p></div>',
          },
        ],
      }),
    };
    target.__TEXTURE_MOCK_OVERRIDES__ = overrides;
  });
  await openBook(page);
  const frame = content(page);
  await expect(frame.locator('h1')).toBeVisible();

  const layout = await frame.locator('body').evaluate((body) => {
    const style = getComputedStyle(body);
    const box = body.getBoundingClientRect();
    return {
      marginLeft: Number.parseFloat(style.marginLeft),
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      left: box.left,
      width: box.width,
      viewport: document.documentElement.clientWidth,
    };
  });
  // Текст отступает от краёв области с обеих сторон, а сам документ уже окна.
  expect(layout.paddingLeft).toBeGreaterThanOrEqual(24);
  expect(layout.paddingRight).toBeGreaterThanOrEqual(24);
  expect(layout.width).toBeLessThan(layout.viewport);
  // Колонка центрирована: слева и справа остаётся примерно одинаковый запас.
  const right = layout.viewport - (layout.left + layout.width);
  expect(Math.abs(layout.left - right)).toBeLessThanOrEqual(2);
});

// Кнопка шрифта относится к текучему тексту: у постраничных форматов (PDF,
// DjVu) текст — часть растра, и выбор гарнитуры там ничего не меняет.
test('кнопка шрифта есть у EPUB и стоит слева, в группе инструментов', async ({ page }) => {
  await openBook(page);
  const toolbar = page.getByTestId('note-toolbar');
  const toggle = page.getByTestId('reader-font-toggle');
  await expect(toggle).toBeVisible();

  const layout = await toolbar.evaluate((element) => {
    const toggleEl = element.querySelector('[data-testid="reader-font-toggle"]') as HTMLElement;
    const footer = element.querySelector('[data-testid="reader-footer"]') as HTMLElement;
    return {
      toggleLeft: toggleEl.getBoundingClientRect().left,
      footerLeft: footer.getBoundingClientRect().left,
      toolbarLeft: element.getBoundingClientRect().left,
    };
  });
  // Кнопка — в левой части панели, до правой группы управления чтением.
  expect(layout.toggleLeft).toBeGreaterThanOrEqual(layout.toolbarLeft);
  expect(layout.toggleLeft).toBeLessThan(layout.footerLeft);
  // Свой блок с фоном, как у типов заметок и масштаба: единая система панели.
  await expect(toggle).toHaveAttribute('role', 'group');
  const background = await toggle.evaluate((element) => getComputedStyle(element).backgroundColor);
  const zoomGroup = await page
    .getByTestId('reader-zoom-group')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  expect(background).toBe(zoomGroup);
});

// При увеличении масштаба ширина колонки растёт вместе с кеглем: иначе крупный
// текст оказывался на узкой полоске посреди окна и плохо читался.
test('ширина колонки книги растёт вместе с масштабом', async ({ page }) => {
  await openBook(page);
  const frame = content(page);
  await expect(frame.locator('h1')).toBeVisible();

  const metrics = () =>
    frame.locator('body').evaluate((body) => {
      const style = getComputedStyle(body);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        maxWidth: Number.parseFloat(style.maxWidth),
      };
    });

  const before = await metrics();
  // Масштаб применяется в документ книги через склеенную серию: ждём, пока
  // кегль в книге действительно изменится.
  const bigger = page.getByRole('button', { name: 'Увеличить масштаб' });
  await bigger.click();
  await bigger.click();
  await expect.poll(async () => (await metrics()).fontSize).toBeGreaterThan(before.fontSize);

  const after = await metrics();
  // Кегль вырос, и ширина колонки — пропорционально (она задана в `rem`).
  expect(after.maxWidth).toBeGreaterThan(before.maxWidth);
  const textRatio = after.fontSize / before.fontSize;
  const widthRatio = after.maxWidth / before.maxWidth;
  expect(Math.abs(widthRatio - textRatio)).toBeLessThan(0.05);
});
