import { expect, test } from '@playwright/test';
import { showLibraryBookList } from './workplace-area';

/** Ответ активной библиотеки для сценариев страницы книги. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
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
  // Автор — ссылка на список его книг, отдельного свойства «автор» нет.
  await expect(library.getByTestId('book-author-link')).toHaveText('Тестовый автор');
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

test('книга с несколькими форматами: показаны все, читается поддерживаемый', async ({ page }) => {
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

test('книга с несколькими читаемыми форматами: своя кнопка на каждый формат', async ({ page }) => {
  // Два читаемых формата: на каждый — своя кнопка, выбор одним нажатием.
  await page.addInitScript(() => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
        // Форматы объявляют плагины: EPUB и PDF стоят одновременно.
        reader_formats: () => ['epub', 'fb2'],
        reader_plugin_for_format: (payload: unknown) =>
          (payload as { format?: string } | null)?.format === 'fb2'
            ? { plugin_id: 'format-fb2', flowing: true }
            : { plugin_id: 'format-epub', flowing: true },
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
  if (
    await picker
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await picker.first().click();
  }
  await expect(page.getByTestId('workplace-tab')).toHaveText('Книга в двух читаемых');
  // Открылся именно файл FB2, а не первый файл записи.
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __OPENED_PATH__?: string }).__OPENED_PATH__ ?? '',
      ),
    )
    .toContain('multi.fb2');
});

test('возврат к списку сохраняет поиск', async ({ page }) => {
  await page.goto('/');
  await showLibrary(page);
  const library = page.locator('main');

  await library.getByPlaceholder('Название или автор').fill('Демо');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /К списку книг/ }).click();

  await expect(library.getByPlaceholder('Название или автор')).toHaveValue('Демо');
  await expect(library.getByText('Вторая книга')).toBeHidden();
});

/** Книга с заполненными свойствами для сценариев страницы. */
const FULL_BOOK = {
  id: 'full',
  title: 'Книга с авторами',
  authors: ['Первый автор', 'Второй автор'],
  tags: ['философия'],
  language: 'ru',
  published: '2019-05-01',
  publisher: 'Издательский дом',
  identifier: 'urn:isbn:978-5-00000-000-0',
  description: 'Описание книги для проверки правки по месту.',
  size: 2048000,
  added_at_ms: 1700000000000,
  files: [{ kind: 'book', path: 'full.epub', format: 'epub' }],
};

/** Открытие страницы книги с заданным каталогом. */
async function openBookPage(
  page: import('@playwright/test').Page,
  books: unknown[],
  title: RegExp,
  formats: string[] = ['epub'],
) {
  await page.addInitScript(
    ({ catalog, readerFormats }) => {
      // Правки свойств копятся в памяти: ядро в моке хранит тот же документ.
      const stored: Record<string, unknown> = {};
      (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
        handlers: {
          active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
          reader_formats: () => readerFormats,
          invoke_plugin_operation: () => ({ catalog: { books: catalog } }),
          book_properties_get: () => stored,
          book_properties_set: (payload: unknown) => {
            const message = payload as { path?: string; properties?: Record<string, unknown> };
            const path = String(message.path ?? '');
            const properties = message.properties ?? {};
            const hasValue = Object.values(properties).some((value) =>
              Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '',
            );
            if (path && hasValue) {
              stored[path] = properties;
            } else if (path) {
              delete stored[path];
            }
            return stored;
          },
        },
      };
    },
    { catalog: books, readerFormats: formats },
  );
  await page.goto('/');
  await showLibraryBookList(page);
  const library = page.locator('main');
  await library.getByRole('button', { name: title }).first().click();
  await expect(library.getByTestId('book-page')).toBeVisible();
  return library;
}

test('все форматы книги равноправны: у каждого свои действия', async ({ page }) => {
  const library = await openBookPage(
    page,
    [
      {
        id: 'multi',
        title: 'Книга с двумя файлами',
        authors: [],
        tags: [],
        files: [
          { kind: 'book', path: 'multi.epub', format: 'epub' },
          { kind: 'book', path: 'multi.pdf', format: 'pdf' },
        ],
      },
    ],
    /Книга с двумя файлами/,
    ['epub', 'pdf'],
  );

  // Ни «основного» формата, ни группы «другие файлы»: строки одинаковы.
  await expect(library.getByTestId('book-other-formats')).toHaveCount(0);
  for (const format of ['epub', 'pdf']) {
    const row = library.getByTestId(`book-format-${format}`);
    await expect(row.getByTestId(`book-read-${format}`)).toBeVisible();
    await expect(row.getByRole('button', { name: 'Открыть' })).toBeVisible();
  }
});

test('режим правки открывает каждое поле своим действием', async ({ page }) => {
  const library = await openBookPage(page, [FULL_BOOK], /Книга с авторами/);

  // Обычный режим: значения только читаются, названия разделов на месте.
  await expect(library.getByTestId('book-edit-save')).toHaveCount(0);
  await expect(library.getByTestId('book-description')).toBeVisible();

  const toggle = library.getByTestId('book-edit-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // Авторы правятся по одному, описание — отдельным действием.
  await expect(library.getByTestId('book-author-0').getByLabel('Изменить: автор')).toBeVisible();
  await expect(library.getByTestId('book-author-1').getByLabel('Изменить: автор')).toBeVisible();
  await expect(library.getByLabel('Изменить: описание')).toBeVisible();
  await expect(library.getByLabel('Изменить: Издатель')).toBeVisible();
});

test('правка по месту не сбрасывает значения соседних полей', async ({ page }) => {
  const library = await openBookPage(page, [FULL_BOOK], /Книга с авторами/);
  await library.getByTestId('book-edit-toggle').click();

  // Правка названия сохраняется, а издатель остаётся прежним.
  await library.getByLabel('Изменить: Название').click();
  const titleField = library.getByLabel('Название');
  await titleField.fill('Уточнённое название');
  await library.getByTestId('book-edit-save').click();

  await expect(library.getByTestId('book-title')).toHaveText('Уточнённое название');
  await expect(library.getByTestId('book-property-publisher')).toHaveText('Издательский дом');
});

test('на телефоне действие и содержание доступны без прокрутки вправо', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const library = await openBookPage(page, [FULL_BOOK], /Книга с авторами/);

  // Обложка и главное действие в первом экране: книга и «Читать» видны сразу.
  const cover = library.getByTestId('book-page').locator('img, svg').first();
  await expect(cover).toBeVisible();
  const read = library.getByTestId('book-read-epub');
  await expect(read).toBeVisible();
  const box = await read.boundingBox();
  expect(box!.y).toBeLessThan(520);

  // Горизонтальной прокрутки нет.
  const overflow = await library.getByTestId('book-page').evaluate((element) => {
    const scroller = element.querySelector('[class*="overflow-y-auto"]') ?? element;
    return scroller.scrollWidth - scroller.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

test('на большом мониторе набор и ширина страницы крупнее', async ({ page }) => {
  // 1440px и выше — отдельная ступень: текст, обложка и предел ширины растут,
  // иначе интерфейс ноутбука читается на большом экране мелким.
  await page.setViewportSize({ width: 1920, height: 1080 });
  const library = await openBookPage(page, [FULL_BOOK], /Книга с авторами/);

  const metrics = await library.getByTestId('book-page').evaluate((element) => {
    const title = element.querySelector('[data-testid="book-title"]') as HTMLElement;
    const description = element.querySelector('[data-testid="book-description"]') as HTMLElement;
    const grid = element.querySelector('.grid') as HTMLElement;
    return {
      title: parseFloat(getComputedStyle(title).fontSize),
      body: parseFloat(getComputedStyle(description).fontSize),
      width: grid.getBoundingClientRect().width,
    };
  });

  // Ступень набора: заголовок и текст крупнее ноутбучных 24px и 14px.
  expect(metrics.title).toBeGreaterThan(24);
  expect(metrics.body).toBeGreaterThan(14);
  // Страница не зажата в узкую колонку посреди пустого окна.
  expect(metrics.width).toBeGreaterThan(1400);
});
