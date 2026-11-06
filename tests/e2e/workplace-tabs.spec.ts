import { expect, test } from '@playwright/test';
import { openWorkspaceArea } from './workplace-area';

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

/** Элемент вкладки по названию книги. */
function tab(page: import('@playwright/test').Page, title: string) {
  return page.locator('[data-testid="workplace-tab-item"]', { hasText: title });
}

/** Обёртка кнопки, несущая подсказку `title`. */
function tooltip(page: import('@playwright/test').Page, label: string) {
  return page.locator(`[title]:has([aria-label="${label}"])`);
}

/** Добавление книги вкладкой в рабочее место. */
async function addBook(page: import('@playwright/test').Page, title: string) {
  await openWorkspaceArea(page);
  const list = page.getByTestId('workspaces-page');
  if (await list.isVisible().catch(() => false)) {
    const open = page.getByTestId('workspace-open').first();
    await open.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    if (await open.isVisible().catch(() => false)) {
      await open.click();
    }
  }
  // На узком окне кнопки открытия книги живут в меню панелей: в полосе их нет.
  const addButton = page.getByRole('button', { name: /Добавить книгу/ });
  if ((await addButton.count()) > 0 && (await addButton.first().isVisible())) {
    await addButton.first().click();
  } else {
    await page.getByTestId('workplace-panel-menu').first().click();
    await page.getByRole('menuitem', { name: /Добавить книгу/ }).click();
  }
  const library = page.locator('main');
  const back = library.getByRole('button', { name: /К списку книг/ });
  if ((await back.count()) > 0) {
    await back.click();
  }
  await library.getByRole('button', { name: new RegExp(title) }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  await expect(page.getByTestId('workplace-area')).toBeVisible();
}

test('переключение вкладок меняет активную книгу', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');

  // Имя открытого рабочего места видно в навигационном тексте шапки.
  await expect(page.getByTestId('app-context')).toContainText('Рабочее место');

  await expect(tab(page, 'Третья книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await tab(page, 'Демо-книга').getByTestId('workplace-tab').click();

  await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(tab(page, 'Третья книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('закрытие активной вкладки требует подтверждения и активирует соседнюю', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');

  await tab(page, 'Третья книга').getByTestId('workplace-tab-close').click();

  // Иконка закрытия не закрывает вкладку сразу — открывается подтверждение.
  await expect(page.getByTestId('workplace-tab-close-question')).toBeVisible();
  await expect(page.getByTestId('workplace-tab')).toHaveCount(2);

  await page.getByRole('button', { name: 'Да' }).click();

  await expect(page.getByTestId('workplace-tab')).toHaveCount(1);
  await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('отмена подтверждения не закрывает вкладку', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  await tab(page, 'Демо-книга').getByTestId('workplace-tab-close').click();
  await expect(page.getByTestId('workplace-tab-close-question')).toBeVisible();

  await page.getByRole('button', { name: 'Нет' }).click();

  await expect(page.getByTestId('workplace-tab-close-question')).toHaveCount(0);
  await expect(page.getByTestId('workplace-tab')).toHaveCount(1);
});

test('дублирование вкладки создаёт независимую вкладку', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  await tab(page, 'Демо-книга').getByLabel('Дублировать вкладку').click();

  await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
  await expect(page.getByTestId('workplace-tab').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('дублирование вкладки доступно пунктом меню панели открытых вкладок', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  const panel = page.getByTestId('open-books-panel');

  await panel.getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Дублировать вкладку' }).click();

  await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
  await expect(page.getByTestId('workplace-tab').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('переключение вкладки в полосе прокручивает список панели к ней', async ({ page }) => {
  // Дефект: вкладку переключали в полосе сверху, а список панели оставался на
  // прежнем месте, и выбранной вкладки в нём не было видно.
  await page.setViewportSize({ width: 920, height: 600 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await duplicateActive(page, 8);

  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  const panel = page.getByTestId('open-books-panel');
  const list = page.getByTestId('open-books-list');
  await expect(list).toBeVisible();

  // При открытии панель показывает активную (последнюю) вкладку: список сдвинут.
  await expect.poll(async () => await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // Переключение на первую вкладку в полосе: строка в панели выше видимой части.
  await page.getByTestId('workplace-tab-item').first().getByTestId('workplace-tab').click();

  // Список панели подводит выбранную строку в видимую часть.
  await expect
    .poll(async () => {
      const row = await panel
        .locator('[data-testid="open-books-item"][data-active="true"]')
        .boundingBox();
      const view = await list.boundingBox();
      if (!row || !view) {
        return false;
      }
      return row.y >= view.y - 1 && row.y + row.height <= view.y + view.height + 1;
    })
    .toBe(true);
});

test('закрытие последней вкладки показывает пустое состояние', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  await tab(page, 'Демо-книга').getByTestId('workplace-tab-close').click();
  await page.getByRole('button', { name: 'Да' }).click();

  await expect(page.getByTestId('workplace-empty')).toBeVisible();
  await expect(page.getByTestId('workplace-tab')).toHaveCount(0);
});

test('панель открытых вкладок выбирает и закрывает вкладки', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');

  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  const panel = page.getByTestId('open-books-panel');
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Демо-книга' }).click();
  await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Закрытие из панели — без подтверждения: осознанный пункт меню.
  await panel.locator('li', { hasText: 'Третья книга' }).getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Закрыть вкладку' }).click();
  await expect(page.getByTestId('workplace-tab-close-question')).toHaveCount(0);
  await expect(page.getByTestId('workplace-tab')).toHaveCount(1);
  await expect(panel).toBeVisible();
});

/** Страница активной вкладки рабочего места. */
function activePage(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="workplace-tab-page"][data-active="true"]');
}

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
  await tab(page, 'Демо-книга').getByTestId('workplace-tab').click();
  await expect(tab(page, 'Демо-книга').getByTestId('workplace-tab')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

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

  await tab(page, 'Демо-книга').getByTestId('workplace-tab').click();

  // Вкладка активной становится другая книга, а прежняя не исчезает.
  await expect(page.getByTestId('workplace-tab-page')).toHaveCount(2);
  await expect(page.locator('[data-testid="workplace-tab-page"][data-active="false"]')).toHaveCount(
    1,
  );
});

/** Дублирование активной вкладки заданное число раз. */
async function duplicateActive(page: import('@playwright/test').Page, times: number) {
  for (let index = 0; index < times; index += 1) {
    await page
      .locator('[data-testid="workplace-tab-item"]:has([aria-pressed="true"])')
      .getByLabel('Дублировать вкладку')
      .first()
      .click();
  }
}

test('при переполнении вкладки ограничены по ширине, доступны навигация и счётчик', async ({
  page,
}) => {
  // Широкое окно: на узком полоса вкладок показывает одну активную вкладку.
  await page.setViewportSize({ width: 920, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await duplicateActive(page, 4);

  // Состав вкладок сохранён, но показаны не все: навигация и счётчик видны.
  await expect(page.getByLabel('Следующие вкладки')).toBeVisible();
  await expect(page.getByLabel('Предыдущие вкладки')).toBeVisible();
  const counter = page.getByTestId('workplace-tabs-counter');
  await expect(counter).toBeVisible();
  await expect(counter).toContainText('из 5');

  const shown = await page.getByTestId('workplace-tab-item').count();
  expect(shown).toBeLessThan(5);
  expect(shown).toBeGreaterThan(0);

  // Кнопки открытия книги закреплены и видны.
  await expect(page.getByLabel('Добавить книгу')).toBeVisible();
  await expect(page.getByLabel('Открыть файл с диска')).toBeVisible();

  // Горизонтальной прокрутки документа нет.
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});

test('навигация по вкладкам сдвигает видимый диапазон, не меняя активную вкладку', async ({
  page,
}) => {
  await page.setViewportSize({ width: 920, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  // Вкладок заметно больше ёмкости полосы: тогда число видимых не зависит от
  // того, показан ли счётчик (он сам занимает место в полосе).
  await duplicateActive(page, 6);

  const counter = page.getByTestId('workplace-tabs-counter');
  await expect(counter).toBeVisible();

  /** Подпись счётчика после стабилизации раскладки.
   *
   * Счётчик сам занимает место в полосе и меняет ёмкость окна, поэтому
   * читаем диапазон только когда два подряд замера совпали: иначе проверка
   * ловила бы промежуточный кадр.
   */
  const stableCounter = async () => {
    let previous = '';
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = (await counter.textContent())?.trim() ?? '';
      if (current !== '' && current === previous) {
        return current;
      }
      previous = current;
      await page.waitForTimeout(50);
    }
    return previous;
  };
  const atEnd = await stableCounter();
  expect(atEnd).toContain('из 7');

  /** Первая и последняя показанные вкладки из подписи счётчика. */
  const rangeOf = (text: string) => {
    const match = /(\d+)–(\d+)/.exec(text);
    return match ? { from: Number(match[1]), to: Number(match[2]) } : null;
  };
  const endRange = rangeOf(atEnd);
  expect(endRange).not.toBeNull();

  // Сдвиг назад доступен, пока окно не в начале: полоса не листает за край.
  const previous = page.getByLabel('Предыдущие вкладки');
  if (await previous.isEnabled()) {
    await previous.click();
    const shifted = await stableCounter();
    expect(shifted).not.toBe(atEnd);
    const shiftedRange = rangeOf(shifted);
    expect(shiftedRange).not.toBeNull();
    expect(shiftedRange!.to).toBeLessThan(7);

    await page.getByLabel('Следующие вкладки').click();
    await expect.poll(stableCounter).toBe(atEnd);
  }

  // Активная вкладка не меняется навигацией: содержимое остаётся тем же.
  await expect(activePage(page)).toHaveCount(1);
});

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
  await expect(page.getByTestId('workplace-tab')).toHaveCount(1);

  const add = page.getByLabel('Добавить книгу');
  await expect(add).toBeDisabled();
  await expect(page.getByLabel('Открыть файл с диска')).toBeDisabled();
  await expect(page.getByLabel('Дублировать вкладку').first()).toBeDisabled();

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
  await expect(page.getByTestId('workplace-tab')).toHaveCount(2);

  // Лимит опускается ниже числа открытых вкладок: две вкладки — превышение.
  await openSettings(page);
  await saveOpenTabsLimit(page, 1);
  await closeSettings(page);

  // Вкладки сохранены, открытие заблокировано и выделено, подсказка о превышении.
  await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
  const add = page.getByLabel('Добавить книгу');
  await expect(add).toBeDisabled();
  await expect(page.getByLabel('Открыть файл с диска')).toBeDisabled();
  await expect(tooltip(page, 'Добавить книгу')).toHaveAttribute(
    'title',
    'Превышен лимит открытых вкладок',
  );
  await expect(add).toHaveClass(/text-destructive/);
  // Кнопка дублирования вкладки тоже выделена как превышение.
  await expect(page.getByLabel('Дублировать вкладку').first()).toHaveClass(/text-destructive/);

  // Отдельной ленты уведомлений нет: превышение пишется в журнал
  // диагностики, а пользователю о нём говорит сама подсказка кнопки.

  // Повышение лимита возвращает доступность и снимает выделение превышения.
  await openSettings(page);
  await saveOpenTabsLimit(page, 5);
  await closeSettings(page);

  await expect(add).toBeEnabled();
  await expect(add).not.toHaveClass(/text-destructive/);
  await expect(tooltip(page, 'Добавить книгу')).toHaveAttribute('title', 'Добавить книгу');
  await expect(page.getByLabel('Дублировать вкладку').first()).not.toHaveClass(/text-destructive/);
});

test('номера вкладок совпадают с полосой и списком и не меняются при поиске', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await duplicateActive(page, 2);

  // Номера в полосе — это места вкладок в составе места.
  const strip = page.getByTestId('workplace-tab-number');
  await expect(strip).toHaveText(['1', '2', '3']);

  // В панели списка ровно те же номера.
  await openBooks(page);
  const panel = page.getByTestId('open-books-item-number');
  await expect(panel).toHaveText(['1', '2', '3']);

  // Поиск фильтрует список, но номера остаются местами в составе, а не
  // порядковыми номерами отфильтрованных строк.
  await page.getByTestId('open-books-panel').getByLabel('Поиск по вкладкам').fill('Демо');
  await expect(panel.first()).toHaveText('1');
});

/** Открытие панели открытых книг. */
async function openBooks(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  await expect(page.getByTestId('open-books-panel')).toBeVisible();
}

test('длинное описание вкладки видно полностью', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openBooks(page);

  const panel = page.getByTestId('open-books-panel');
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

test('правка оформления вкладки видна и в панели, и на панели вкладок', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openBooks(page);

  const panel = page.getByTestId('open-books-panel');
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

  // Панель открытых книг: имя, иконка и описание отдельной строкой.
  await expect(panel.getByRole('button', { name: /Черновик/ })).toBeVisible();
  await expect(panel.getByTestId('open-books-item-description')).toHaveText('сравнение глав');

  // Панель вкладок: та же подпись и иконка; в подсказке — книга и описание.
  const item = tab(page, 'Черновик');
  await expect(item.getByTestId('workplace-tab')).toHaveAttribute('title', 'Черновик (Демо-книга)');
  await expect(item.getByTestId('workplace-tab').locator('svg')).toHaveCount(1);
});

test('в пункте панели виден путь к файлу книги', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openBooks(page);

  const item = page.getByTestId('open-books-panel').getByTestId('open-books-item');
  await expect(item.getByTestId('open-books-item-path')).toHaveText('/demo-library/demo-1.epub');
  // Точный текст пути доступен в подсказке: строка обрезается по ширине панели.
  await expect(item.locator('span[title="/demo-library/demo-1.epub"]')).toHaveCount(1);
});

test('цвет вкладки заливает её и в панели, и на панели вкладок', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openBooks(page);

  const panel = page.getByTestId('open-books-panel');
  await panel.getByLabel('Оформление вкладки').click();
  await page.getByTestId('menu-color-blue').click();

  // Заливка приглушённым тоном цвета: смешивание с фоном области.
  await expect(panel.getByTestId('open-books-item')).toHaveAttribute('style', /color-mix/);
  await expect(tab(page, 'Демо-книга')).toHaveAttribute('style', /color-mix/);

  // Сброс оформления снимает заливку.
  await panel.getByLabel('Оформление вкладки').click();
  await page.getByRole('menuitem', { name: 'Сбросить все изменения' }).click();

  await expect(panel.getByTestId('open-books-item')).not.toHaveAttribute('style', /color-mix/);
  await expect(tab(page, 'Демо-книга')).not.toHaveAttribute('style', /color-mix/);
});

test('поиск по вкладкам фильтрует список и не меняет состав', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await addBook(page, 'Третья книга');
  await openBooks(page);

  const panel = page.getByTestId('open-books-panel');
  await expect(panel.locator('li')).toHaveCount(2);

  await panel.getByLabel('Поиск по вкладкам').fill('Третья');
  await expect(panel.locator('li')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: /Третья книга/ })).toBeVisible();

  // Пустой результат поиска не закрывает вкладки.
  await panel.getByLabel('Поиск по вкладкам').fill('нет такой книги');
  await expect(panel.getByTestId('open-books-search-empty')).toBeVisible();
  await expect(page.getByTestId('workplace-tab')).toHaveCount(2);
});

test('правка имени открывается снова после отмены', async ({ page }) => {
  await page.goto('/');
  await addBook(page, 'Демо-книга');
  await openBooks(page);

  const panel = page.getByTestId('open-books-panel');
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

  // Открытие панели открытых книг закрывает панель заметок и наоборот.
  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  await expect(page.getByTestId('open-books-panel')).toBeVisible();

  await page.getByTestId('workplace-notes-toggle').click();
  await expect(page.getByTestId('notes-panel')).toBeVisible();
  await expect(page.getByTestId('open-books-panel')).toHaveCount(0);

  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  await expect(page.getByTestId('open-books-panel')).toBeVisible();
  await expect(page.getByTestId('notes-panel')).toHaveCount(0);

  // Панели одной ширины: тот же токен, что у панели заметок.
  const books = await page.getByTestId('open-books-panel').boundingBox();
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

  await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  const item = page.getByTestId('open-books-item').first();
  await expect(item.getByTestId('open-books-item-path-badge')).toHaveText('EPUB');
  await expect(item.getByTestId('open-books-item-path')).toContainText('/');
});

test('на телефоне меню панелей стоит слева от вкладки, у вкладки своё меню', async ({ page }) => {
  // На узком окне видна одна вкладка. Панели и открытие книги — в меню слева от
  // неё, собственные действия вкладки — в её меню справа.
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  const bar = page.getByTestId('workplace-tabs');
  await expect(bar).toBeVisible();

  // Ни кнопок панелей, ни кнопки открытия книги в полосе нет.
  await expect(page.getByTestId('workplace-notes-toggle')).toHaveCount(0);
  await expect(page.getByTestId('workplace-properties-toggle')).toHaveCount(0);
  await expect(bar.getByLabel('Добавить книгу')).toHaveCount(0);

  // Вместо них — меню слева от вкладки; у вкладки — своё меню.
  await expect(page.getByTestId('workplace-panel-menu')).toBeVisible();
  await expect(page.getByTestId('workplace-tab-menu')).toBeVisible();
  await expect(page.getByTestId('workplace-tab-close')).toHaveCount(0);

  // Порядок слева направо: меню панелей, окно вкладки, затем меню вкладки.
  const [panelMenu, tabWindow, tabMenu] = await Promise.all([
    page.getByTestId('workplace-panel-menu').boundingBox(),
    page.getByTestId('workplace-tabs-window').boundingBox(),
    page.getByTestId('workplace-tab-menu').boundingBox(),
  ]);
  expect(panelMenu).not.toBeNull();
  expect(tabWindow).not.toBeNull();
  expect(tabMenu).not.toBeNull();
  expect(tabWindow!.x).toBeGreaterThan(panelMenu!.x);
  expect(tabMenu!.x).toBeGreaterThan(tabWindow!.x - 1);
});

test('вкладка занимает всю доступную ширину полосы', async ({ page }) => {
  // Одна вкладка при широком окне не должна жаться к левому краю: она делит
  // свободное место с соседями и растягивается на всю полосу.
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  const windowBox = await page.getByTestId('workplace-tabs-window').boundingBox();
  const tabBox = await page.getByTestId('workplace-tab-item').first().boundingBox();
  expect(windowBox).not.toBeNull();
  expect(tabBox).not.toBeNull();
  // Ширина вкладки совпадает с окном вкладок: свободного места не осталось.
  expect(Math.abs(tabBox!.width - windowBox!.width)).toBeLessThan(2);
  // И она начинается от левого края окна, а не стоит отдельным островком.
  expect(Math.abs(tabBox!.x - windowBox!.x)).toBeLessThan(2);

  // При переполнении вкладки держат свой размер, иначе все не поместились бы.
  await page.setViewportSize({ width: 920, height: 800 });
  await duplicateActive(page, 6);
  const items = await page.getByTestId('workplace-tab-item').count();
  expect(items).toBeLessThan(7);
  const first = await page.getByTestId('workplace-tab-item').first().boundingBox();
  expect(first!.width).toBeLessThan(windowBox!.width / 2);
});

test('на узком окне действия вкладки собраны в меню', async ({ page }) => {
  // Режим определяется размером окна: телефон/планшет — до 900px.
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  // В полосе видна одна вкладка, отдельных кнопок закрытия и дублирования нет.
  await expect(page.getByTestId('workplace-tab-item')).toHaveCount(1);
  await expect(page.getByTestId('workplace-tab-close')).toHaveCount(0);

  // У вкладки — только её собственные действия.
  await page.getByTestId('workplace-tab-menu').click();
  await expect(page.getByRole('menuitem', { name: 'Закрыть вкладку' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Дублировать вкладку' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Добавить книгу' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Панели и открытие книги — в отдельном меню слева от вкладки.
  await page.getByTestId('workplace-panel-menu').click();
  await expect(page.getByRole('menuitem', { name: 'Вкладки' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Заметки' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Свойства файла' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Добавить книгу' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Открыть файл с диска' })).toBeVisible();
});

test('на широком окне кнопки вкладки остаются на месте', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await addBook(page, 'Демо-книга');

  // До 900px меню нет, кнопки закрытия и открытия книги — как прежде.
  await expect(page.getByTestId('workplace-tab-menu')).toHaveCount(0);
  await expect(page.getByTestId('workplace-panel-menu')).toHaveCount(0);
  await expect(page.getByTestId('workplace-tab-close').first()).toBeVisible();
  await expect(page.getByLabel('Добавить книгу').first()).toBeVisible();

  // Слева три кнопки панелей, справа — «добавить», «открыть», сосредоточенное
  // чтение; разделителя между панелями и вкладками нет.
  const panels = await page.getByTestId('workplace-tabs-panels').boundingBox();
  const add = await page.getByTestId('workplace-tabs-actions').boundingBox();
  const focus = await page.getByTestId('workplace-focus-toggle').boundingBox();
  expect(panels!.x).toBeLessThan(add!.x);
  expect(add!.x).toBeLessThan(focus!.x);
  await expect(page.getByTestId('workplace-tabs').locator('.w-px')).toHaveCount(0);
});
