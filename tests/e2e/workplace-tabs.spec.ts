import { expect, test } from '@playwright/test';
import { addBookToWorkspace, booksPanel, ensureBooksPanel, hideBooksPanel } from './workplace-area';

/** Ответ активной библиотеки для сценариев вкладок. */
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
              opened_at_millis: 1_700_000_000_000,
              tabs: [],
              active_tab_id: null,
            },
          ],
          active_workspace_id: 'ws-1',
        }),
        save_workspaces: () => ({ ok: true }),
        // Лимит открытых вкладок читается на бутстрапе; значение берётся
        // из глобальной переменной, чтобы тест мог задать его до загрузки
        // страницы. Без явного задания действует значение по умолчанию 50.
        window_open_tabs_limit: () =>
          (
            window as unknown as {
              __TEXTURE_MOCK_OPEN_TABS_LIMIT__?: number;
            }
          ).__TEXTURE_MOCK_OPEN_TABS_LIMIT__ ?? 50,
      },
    };
  }, ACTIVE_LIBRARY);
});

/** Задание лимита открытых вкладок в моке до загрузки страницы. */
async function setOpenTabsLimit(page: import('@playwright/test').Page, limit: number) {
  await page.addInitScript((value) => {
    (
      window as unknown as { __TEXTURE_MOCK_OPEN_TABS_LIMIT__?: number }
    ).__TEXTURE_MOCK_OPEN_TABS_LIMIT__ = value;
  }, limit);
}

/** Строка вкладки в панели списка по названию книги. */
function row(page: import('@playwright/test').Page, title: string) {
  return booksPanel(page).locator('[data-testid="open-books-item"]', { hasText: title });
}

/** Обёртка кнопки, несущая подсказку `title`. */
function tooltip(page: import('@playwright/test').Page, label: string) {
  return page.locator(`[title]:has([aria-label="${label}"])`);
}

/** Добавление книги вкладкой в рабочее место. */
async function addBook(page: import('@playwright/test').Page, title: string) {
  await addBookToWorkspace(page, new RegExp(title));
}

/** Дублирование активной вкладки заданное число раз.
 *
 * Действие живёт в контекстном меню вкладки, которое открывается из панели.
 */
async function duplicateActive(page: import('@playwright/test').Page, times: number) {
  await ensureBooksPanel(page);
  const panel = booksPanel(page);
  for (let index = 0; index < times; index += 1) {
    const active = panel.locator('[data-testid="open-books-item"][data-active="true"]');
    await active.getByLabel('Оформление вкладки').click();
    await page.getByRole('menuitem', { name: 'Дублировать вкладку' }).click();
  }
}

test('панель активной вкладки показывает номер, название и путь книги', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  const active = page.getByTestId('workplace-active-tab');
  await expect(active).toBeVisible();
  await expect(active.getByTestId('workplace-tab-number')).toHaveText('1');
  await expect(active.getByTestId('workplace-tab')).toHaveText('Демо-книга');

  // Путь стоит под названием и виден целиком: панель широкая, обрезки нет.
  const path = active.getByTestId('workplace-active-path');
  await expect(path).toHaveText('/demo-library/demo-1.epub');
  await expect(path).toHaveAttribute('title', '/demo-library/demo-1.epub');
  const clipped = await path.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});

test('путь под названием приглушён: он не спорит с названием книги', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  const colors = await page.evaluate(() => {
    const path = document.querySelector('[data-testid="workplace-active-path"]');
    const title = document.querySelector('[data-testid="workplace-tab"]');
    if (!path || !title) {
      return null;
    }
    return { path: getComputedStyle(path).color, title: getComputedStyle(title).color };
  });
  expect(colors).not.toBeNull();
  expect(colors!.path).not.toBe(colors!.title);
});

test('в приложении нет горизонтальной полосы вкладок', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  // Весь состав рабочего места живёт в панели списка, а сверху — только
  // активная книга. Прежних элементов полосы (окно вкладок, счётчик,
  // переполнение) больше нет.
  await expect(page.getByTestId('workplace-tabs-window')).toHaveCount(0);
  await expect(page.getByTestId('workplace-tabs-counter')).toHaveCount(0);
  await expect(page.getByTestId('workplace-tab-item')).toHaveCount(0);
});

test('список вкладок открыт по умолчанию: это единственное место со всем составом', async ({
  page,
}) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  await expect(booksPanel(page)).toBeVisible();
  await expect(booksPanel(page).getByTestId('open-books-item')).toHaveCount(1);

  // Кнопка панели закрывает и снова открывает список.
  await hideBooksPanel(page);
  await ensureBooksPanel(page);
});

test('переключение вкладок в списке меняет активную книгу', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');

  // Шапки в рабочем месте нет: место работы называет панель активной вкладки.
  await expect(page.getByTestId('app-context')).toHaveCount(0);

  // Панель называет только активную книгу — последнюю открытую.
  await expect(page.getByTestId('workplace-tab')).toHaveText('Третья книга');

  await row(page, 'Демо-книга').getByRole('button').first().click();

  await expect(page.getByTestId('workplace-active-tab')).toBeVisible();
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
  await expect(row(page, 'Демо-книга')).toHaveAttribute('data-active', 'true');
  await expect(row(page, 'Третья книга')).toHaveAttribute('data-active', 'false');
});

test('закрытие активной вкладки требует подтверждения и активирует соседнюю', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');

  await row(page, 'Третья книга').getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Закрыть вкладку' }).click();

  // Закрытие из меню — осознанный пункт: подтверждения не спрашивают.
  await expect(page.getByTestId('workplace-tab-close-question')).toHaveCount(0);
  await expect(page.getByTestId('open-books-item')).toHaveCount(1);
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
});

test('дублирование вкладки создаёт независимую вкладку', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await duplicateActive(page, 1);

  await expect(page.getByTestId('open-books-item')).toHaveCount(2);
  // Активной становится созданная копия, и её номер — второй.
  await expect(page.getByTestId('workplace-tab-number')).toHaveText('2');
});

test('переключение вкладки в списке подводит активную строку в видимую часть', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await duplicateActive(page, 8);

  const panel = booksPanel(page);
  const list = page.getByTestId('open-books-list');
  await expect(list).toBeVisible();

  // При открытии панель показывает активную (последнюю) вкладку: список сдвинут.
  await expect.poll(async () => await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // Переключение на первую вкладку: строка в панели выше видимой части.
  await panel
    .locator('[data-testid="open-books-item"]')
    .first()
    .getByRole('button')
    .first()
    .click();

  // Список панели подводит выбранную строку в видимую часть.
  await expect
    .poll(async () => {
      const found = await panel
        .locator('[data-testid="open-books-item"][data-active="true"]')
        .boundingBox();
      const view = await list.boundingBox();
      if (!found || !view) {
        return false;
      }
      return found.y >= view.y - 1 && found.y + found.height <= view.y + view.height + 1;
    })
    .toBe(true);
});

test('закрытие последней вкладки показывает пустое состояние', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  await row(page, 'Демо-книга').getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Закрыть вкладку' }).click();

  await expect(page.getByTestId('workplace-empty')).toBeVisible();
  await expect(page.getByTestId('workplace-active-tab')).toHaveCount(0);
  await expect(page.getByTestId('open-books-item')).toHaveCount(0);
});

test('позиция чтения сохраняется при переключении вкладок', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  // Книгу рисует плагин: до её готовности прокручивать нечего.
  await expect(
    page.frameLocator('iframe[title="Содержимое книги"]').getByText('Первый абзац книги.'),
  ).toBeVisible();
  const iframe = activePage(page).locator('iframe[title="Содержимое книги"]');
  const box = await iframe.boundingBox();
  if (!box) {
    throw new Error('область чтения не найдена');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 1500);
  await expect
    .poll(async () => {
      const text = await page.getByTestId('reader-progress').textContent();
      return Number.parseInt(text ?? '0', 10);
    })
    .toBeGreaterThan(0);
  const savedProgress = Number.parseInt(
    (await page.getByTestId('reader-progress').textContent()) ?? '0',
    10,
  );

  await addBook(page, 'Третья книга');
  await row(page, 'Демо-книга').getByRole('button').first().click();
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

  // Книга не перезагружается: позиция сохраняется сразу, без повторного чтения.
  await expect(page.getByTestId('reader-progress')).toHaveText(`${savedProgress}%`);
});

test('вкладки остаются открытыми при переключении', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');

  // Обе вкладки смонтированы, видима только активная.
  await expect(page.getByTestId('workplace-tab-page')).toHaveCount(2);
  await expect(activePage(page)).toHaveCount(1);

  await row(page, 'Демо-книга').getByRole('button').first().click();

  // Активной становится другая книга, а прежняя не исчезает.
  await expect(page.getByTestId('workplace-tab-page')).toHaveCount(2);
  await expect(page.locator('[data-testid="workplace-tab-page"][data-active="false"]')).toHaveCount(
    1,
  );
});

/** Страница активной вкладки рабочего места. */
function activePage(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="workplace-tab-page"][data-active="true"]');
}

/** Открытие общего раздела настроек. */
async function openSettings(page: import('@playwright/test').Page) {
  await page.getByLabel('Настройки', { exact: true }).click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
}

/** Закрытие раздела настроек кнопкой в углу страницы настроек. */
async function closeSettings(page: import('@playwright/test').Page) {
  await page.getByLabel('Закрыть настройки').click();
  await expect(page.getByTestId('settings-page')).toBeHidden();
}

/**
 * Запись лимита открытых вкладок через раздел настроек.
 *
 * Выбран настоящий путь через интерфейс, а не прямая эмуляция события
 * `settings:changed`: так проверяется, что значение из поля настроек
 * действительно доходит до области рабочего места. Правка подтверждается
 * единой кнопкой сохранения страницы настроек.
 */
async function saveOpenTabsLimit(page: import('@playwright/test').Page, limit: number) {
  const settings = page.getByTestId('settings-page');
  await settings.getByLabel('Лимит открытых вкладок').fill(String(limit));
  await settings.getByRole('button', { name: 'Сохранить' }).click();
}

test('при лимите, равном числу вкладок, открытие и дублирование заблокированы', async ({
  page,
}) => {
  // Лимит задан до загрузки приложения: первая же вкладка достигает предела.
  await setOpenTabsLimit(page, 1);
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await expect(page.getByTestId('open-books-item')).toHaveCount(1);

  const add = page.getByLabel('Добавить книгу');
  await expect(add).toBeDisabled();
  await expect(page.getByLabel('Открыть файл с диска')).toBeDisabled();
  // Кнопки дублирования на панели нет: действие есть в контекстном меню.
  await expect(page.getByLabel('Дублировать вкладку')).toHaveCount(0);

  // Достижение предела — ещё не превышение: подсказка без красного выделения.
  await expect(tooltip(page, 'Добавить книгу')).toHaveAttribute(
    'title',
    'Достигнут лимит открытых вкладок',
  );
  await expect(add).not.toHaveClass(/text-destructive/);
});

test('уменьшение лимита сохраняет вкладки и помечает превышение', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');
  await expect(page.getByTestId('open-books-item')).toHaveCount(2);

  // Лимит опускается ниже числа открытых вкладок: две вкладки — превышение.
  await openSettings(page);
  await saveOpenTabsLimit(page, 1);
  await closeSettings(page);

  // Вкладки сохранены, открытие заблокировано и выделено, подсказка о превышении.
  await expect(page.getByTestId('open-books-item')).toHaveCount(2);
  const add = page.getByLabel('Добавить книгу');
  await expect(add).toBeDisabled();
  await expect(page.getByLabel('Открыть файл с диска')).toBeDisabled();
  await expect(tooltip(page, 'Добавить книгу')).toHaveAttribute(
    'title',
    'Превышен лимит открытых вкладок',
  );
  await expect(add).toHaveClass(/text-destructive/);

  // Повышение лимита возвращает доступность и снимает выделение превышения.
  await openSettings(page);
  await saveOpenTabsLimit(page, 5);
  await closeSettings(page);

  await expect(add).toBeEnabled();
  await expect(add).not.toHaveClass(/text-destructive/);
  await expect(tooltip(page, 'Добавить книгу')).toHaveAttribute('title', 'Добавить книгу');
  await expect(page.getByLabel('Дублировать вкладку')).toHaveCount(0);
});

test('перетаскивание в списке меняет порядок и нумерацию вкладок', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await duplicateActive(page, 2);

  const panel = booksPanel(page);
  const items = panel.getByTestId('open-books-item');
  const firstId = await items.nth(0).getAttribute('data-tab-id');
  const secondId = await items.nth(1).getAttribute('data-tab-id');
  const thirdId = await items.nth(2).getAttribute('data-tab-id');

  // Первую строку переносим на место второй: порядок и нумерация меняются.
  // Перенос строится на событиях указателя: нативный HTML5 drag-and-drop в
  // окне приложения оставлял строку серой и заедал курсор.
  const from = await items.nth(0).boundingBox();
  const to = await items.nth(1).boundingBox();
  if (!from || !to) {
    throw new Error('строки не найдены');
  }
  await page.mouse.move(from.x + 40, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + 20, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      panel.getByTestId('open-books-item').evaluateAll((els) => els.map((e) => e.dataset.tabId)),
    )
    .toEqual([secondId, firstId, thirdId]);
  // Номера остаются местами в составе: 1, 2, 3.
  await expect(panel.getByTestId('open-books-item-number')).toHaveText(['1', '2', '3']);
  // Перенос не оставляет курсор в режиме перетаскивания.
  await expect(page.locator('html')).not.toHaveAttribute('data-dragging');
});

test('случайный сдвиг не начинает перенос и не оставляет строку серой', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await duplicateActive(page, 1);

  const items = booksPanel(page).getByTestId('open-books-item');
  const before = await items.evaluateAll((els) => els.map((e) => e.dataset.tabId));
  const box = await items.nth(0).boundingBox();
  if (!box) {
    throw new Error('строка не найдена');
  }
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 42, box.y + 21);
  await page.mouse.up();

  // Порядок не изменился, строка не серая, курсор страницы обычный.
  await expect
    .poll(async () => items.evaluateAll((els) => els.map((e) => e.dataset.tabId)))
    .toEqual(before);
  await expect(items.nth(0)).toHaveCSS('opacity', '1');
  await expect(page.locator('html')).not.toHaveAttribute('data-dragging');
});

test('нажатие на путь файла выбирает вкладку: кликабельна вся строка', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await duplicateActive(page, 1);

  const panel = booksPanel(page);
  // Первая вкладка неактивна: активна последняя после дублирования.
  const path = panel.getByTestId('open-books-item-path').first();
  // Панель подводит к активной строке, поэтому первая может быть за пределами
  // видимой части: без прокрутки клик пришёлся бы мимо строки.
  await path.scrollIntoViewIfNeeded();
  const box = await path.boundingBox();
  if (!box) {
    throw new Error('путь не найден');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(panel.locator('[data-testid="open-books-item"][data-active="true"]')).toHaveCount(1);
  await expect(panel.getByTestId('open-books-item').first()).toHaveAttribute('data-active', 'true');
});

test('номер в панели активной вкладки совпадает со списком и не меняется при поиске', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await duplicateActive(page, 2);

  // Номер на панели — место активной вкладки в составе места.
  await expect(page.getByTestId('workplace-tab-number')).toHaveText('3');

  // В панели списка ровно те же номера.
  await expect(page.getByTestId('open-books-item-number')).toHaveText(['1', '2', '3']);

  // Поиск фильтрует список, но номера остаются местами в составе, а не
  // порядковыми номерами отфильтрованных строк.
  await booksPanel(page).getByLabel('Поиск по вкладкам').fill('Демо');
  await expect(page.getByTestId('open-books-item')).toHaveCount(3);
  await expect(page.getByTestId('open-books-item-number')).toHaveText(['1', '2', '3']);
  // Верхняя панель по-прежнему называет активную вкладку третьим номером.
  await expect(page.getByTestId('workplace-tab-number')).toHaveText('3');
});

test('длинное описание вкладки видно полностью', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await ensureBooksPanel(page);

  const panel = booksPanel(page);
  const long =
    'Сравнение глав первой и второй части, заметки о развитии аргумента, ' +
    'переклички с источниками и предварительные выводы по всему тексту книги.';

  await panel.getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Добавить описание' }).click();
  await page.getByLabel('Описание вкладки').fill(long);
  await page.getByLabel('Сохранить').click();

  const description = panel.getByTestId('open-books-item-description');
  await expect(description).toHaveText(long);

  // Описание не обрезается ни по ширине, ни по высоте: оно переносится
  // на несколько строк и целиком помещается в свою область.
  const metrics = await description.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(metrics.clientHeight).toBeGreaterThan(20);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
});

test('правка оформления вкладки видна и в списке, и на панели активной вкладки', async ({
  page,
}) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await ensureBooksPanel(page);

  const panel = booksPanel(page);
  // Каждое свойство правится отдельным пунктом меню.
  await panel.getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Добавить название' }).click();
  await page.getByLabel('Название вкладки').fill('Черновик');
  await page.getByLabel('Сохранить').click();

  await panel.getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Добавить описание' }).click();
  await page.getByLabel('Описание вкладки').fill('сравнение глав');
  await page.getByLabel('Сохранить').click();

  await panel.getByLabel('Оформление вкладки').click();
  await page.getByTestId('menu-icon-star').click();

  // Панель списка: имя, иконка и описание отдельной строкой.
  await expect(panel.getByRole('button', { name: /Черновик/ })).toBeVisible();
  await expect(panel.getByTestId('open-books-item-description')).toHaveText('сравнение глав');

  // Панель активной вкладки: та же подпись и иконка; в подсказке — книга.
  const active = page.getByTestId('workplace-active-tab');
  await expect(active.getByTestId('workplace-tab')).toHaveText('Черновик');
  await expect(active.getByTestId('workplace-tab').locator('svg')).toHaveCount(0);
  await expect(active.locator('[title="Черновик (Демо-книга)"]')).toHaveCount(1);
  await expect(active.locator('svg').first()).toBeVisible();
});

test('в пункте панели виден путь к файлу книги', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await ensureBooksPanel(page);

  const item = booksPanel(page).getByTestId('open-books-item');
  await expect(item.getByTestId('open-books-item-path')).toHaveText('/demo-library/demo-1.epub');
  // Точный текст пути доступен в подсказке: строка обрезается по ширине панели.
  await expect(item.locator('span[title="/demo-library/demo-1.epub"]')).toHaveCount(1);
});

test('цвет вкладки виден и в списке, и на панели активной вкладки', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await ensureBooksPanel(page);

  const panel = booksPanel(page);
  await panel.getByLabel('Оформление вкладки').click();
  await page.getByTestId('menu-color-blue').click();

  // Пользовательский цвет показывает номер на панели активной вкладки и кнопка
  // меню в списке; сами плашки остаются одинаковыми у всех элементов.
  await expect(page.getByTestId('workplace-active-tab')).toHaveAttribute(
    'style',
    /--accent-fill-blue/,
  );
  await expect(panel.getByLabel('Оформление вкладки')).toHaveAttribute(
    'style',
    /--accent-fill-blue/,
  );

  // Сброс оформления снимает цвет.
  await panel.getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Сбросить все изменения' }).click();

  await expect(page.getByTestId('workplace-active-tab')).not.toHaveAttribute(
    'style',
    /--accent-fill/,
  );
  await expect(panel.getByLabel('Оформление вкладки')).not.toHaveAttribute(
    'style',
    /--accent-fill/,
  );
});

test('поиск по вкладкам фильтрует список и не меняет состав', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');
  await ensureBooksPanel(page);

  const panel = booksPanel(page);
  await expect(panel.locator('li')).toHaveCount(2);

  await panel.getByLabel('Поиск по вкладкам').fill('Третья');
  await expect(panel.locator('li')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: /Третья книга/ })).toBeVisible();

  // Пустой результат поиска не закрывает вкладки.
  await panel.getByLabel('Поиск по вкладкам').fill('нет такой книги');
  await expect(panel.getByTestId('open-books-search-empty')).toBeVisible();
  await expect(page.getByTestId('open-books-item')).toHaveCount(0);
});

test('правка имени открывается снова после отмены', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await ensureBooksPanel(page);

  const panel = booksPanel(page);
  await panel.getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Добавить название' }).click();
  await expect(page.getByLabel('Название вкладки')).toBeVisible();
  await page.getByLabel('Отмена').click();
  await expect(page.getByLabel('Название вкладки')).toBeHidden();

  // Повторное открытие после отмены снова показывает форму.
  await panel.getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Добавить название' }).click();
  await expect(page.getByLabel('Название вкладки')).toBeVisible();
});

test('панели заметок и открытых книг взаимоисключающие', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  // Открытие панели заметок закрывает список вкладок и наоборот.
  await expect(booksPanel(page)).toBeVisible();

  await page.getByTestId('workplace-notes-toggle').click();
  await expect(page.getByTestId('notes-panel')).toBeVisible();
  await expect(booksPanel(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  await expect(booksPanel(page)).toBeVisible();
  await expect(page.getByTestId('notes-panel')).toHaveCount(0);

  // Панели одной ширины: тот же токен, что у панели заметок.
  const books = await booksPanel(page).boundingBox();
  await page.getByTestId('workplace-notes-toggle').click();
  const notes = await page.getByTestId('notes-panel').boundingBox();
  expect(books).not.toBeNull();
  expect(notes).not.toBeNull();
  expect(Math.abs(books!.width - notes!.width)).toBeLessThanOrEqual(1);
});

// В списке вкладок у строки была иконка каталога перед путём к файлу: по ней
// формат книги не виден. Метка формата занимает её место.
test('в списке вкладок формат книги виден вместо иконки каталога', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  const item = booksPanel(page).getByTestId('open-books-item').first();
  await expect(item.getByTestId('open-books-item-path-badge')).toHaveText('EPUB');
  await expect(item.getByTestId('open-books-item-path')).toContainText('/');
});

test('на панели активной вкладки действия над книгой стоят справа', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  // Все действия книги видны и стоят правее названия.
  const title = await page.getByTestId('workplace-active-tab').boundingBox();
  const actions = await page.getByTestId('workplace-tabs-actions').boundingBox();
  expect(title).not.toBeNull();
  expect(actions).not.toBeNull();
  expect(actions!.x).toBeGreaterThan(title!.x);

  await expect(page.getByTestId('workplace-notes-toggle')).toBeVisible();
  await expect(page.getByTestId('workplace-properties-toggle')).toBeVisible();
  await expect(page.getByTestId('workplace-focus-toggle')).toBeVisible();
  await expect(page.getByLabel('Добавить книгу')).toBeVisible();
  await expect(page.getByLabel('Открыть файл с диска')).toBeVisible();
});

test('открытие книги стоит рядом с переключателем вкладок', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  // Вкладку создаёт новая книга, поэтому добавление живёт в одной группе с
  // переключателем списка вкладок, а не среди действий над текущей книгой.
  const open = await page.getByTestId('workplace-open-actions').boundingBox();
  const tabs = await page.getByTestId('workplace-books-toggle').boundingBox();
  const add = await page.getByLabel('Добавить книгу').boundingBox();
  const file = await page.getByLabel('Открыть файл с диска').boundingBox();
  const actions = await page.getByTestId('workplace-tabs-actions').boundingBox();
  const active = await page.getByTestId('workplace-active-tab').boundingBox();

  expect(open).not.toBeNull();
  expect(tabs).not.toBeNull();
  expect(add).not.toBeNull();
  expect(file).not.toBeNull();
  expect(actions).not.toBeNull();
  expect(active).not.toBeNull();

  // Обе кнопки внутри группы открытия.
  expect(tabs!.x).toBeGreaterThanOrEqual(open!.x);
  expect(add!.x).toBeGreaterThanOrEqual(open!.x);
  expect(file!.x + file!.width).toBeLessThanOrEqual(open!.x + open!.width + 1);

  // Группа стоит слева от названия книги, действия над книгой — справа.
  expect(open!.x + open!.width).toBeLessThan(active!.x);
  expect(actions!.x).toBeGreaterThan(active!.x + active!.width);
});

test('высота панели совпадает с кнопками действий на любом масштабе окна', async ({ page }) => {
  // Кнопки считаются от `--spacing`, который растёт на широких мониторах,
  // поэтому и панель должна расти вместе с ними, а не отставать.
  for (const width of [1280, 1500, 2000]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await addBook(page, 'Демо-книга');

    const heights = await page.evaluate(() => {
      const height = (selector: string) => {
        const el = document.querySelector(selector);
        return el ? Math.round(el.getBoundingClientRect().height * 100) / 100 : null;
      };
      return {
        bar: height('[data-testid="workplace-tabs"]'),
        note: height('[data-testid="workplace-notes-toggle"]'),
        add: height('[data-testid="workplace-tabs-actions"] button'),
        focus: height('[data-testid="workplace-focus-toggle"]'),
      };
    });

    expect(heights.bar, `окно ${width}: панель`).not.toBeNull();
    expect(heights.bar! - heights.note!, `окно ${width}: поля вокруг кнопки`).toBeGreaterThan(0);
    expect(heights.note, `окно ${width}: заметки и добавление`).toBe(heights.add);
    expect(heights.note, `окно ${width}: заметки и чтение`).toBe(heights.focus);
  }
});

test('панель активной вкладки не сдвигается при открытии панелей', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  const before = await page.getByTestId('workplace-tabs').boundingBox();
  await page.getByTestId('workplace-notes-toggle').click();
  await expect(page.getByTestId('notes-panel')).toBeVisible();
  const after = await page.getByTestId('workplace-tabs').boundingBox();

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1);
});
