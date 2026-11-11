import { expect, test } from '@playwright/test';
import { showLibraryBookList } from './workplace-area';

/** Показ списка книг библиотеки через раздел «Библиотеки». */
async function showLibrary(page: import('@playwright/test').Page) {
  await showLibraryBookList(page);
}

test('знак приложения — логотип из файла, окрашенный в акцент темы', async ({ page }) => {
  await page.goto('/');
  const name = page.getByTestId('app-name');
  await expect(name).toBeVisible();

  // Знак — логотип `context-logo.svg`: квадратная область того же размера,
  // что прежняя плашка, поэтому шапка не меняет высоту.
  const box = await name.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(1);
  // Контуры логотипа рисуются `currentColor` и берут акцент темы: знак виден
  // на светлой и тёмной стороне и согласован с выделением раздела.
  await expect(name).toHaveClass(/text-\[var\(--primary\)\]/);
  await expect(name.locator('svg')).toHaveCount(1);
  await expect(name.locator('svg path')).toHaveCount(3);

  // Цвет контуров следует теме: он равен акценту активной палитры и стороны,
  // а не задан в файле логотипа жёстко.
  const logoColor = await name
    .locator('svg path')
    .first()
    .evaluate((path) => getComputedStyle(path).fill);
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
  );
  expect(logoColor).toBe(
    await page.evaluate((hex) => {
      const probe = document.createElement('span');
      probe.style.color = hex;
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }, primary),
  );

  // В тёмной стороне цвет меняется вместе с темой.
  await page.getByLabel('Переключить тему', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const darkLogoColor = await name
    .locator('svg path')
    .first()
    .evaluate((path) => getComputedStyle(path).fill);
  expect(darkLogoColor).not.toBe(logoColor);
  // Настоящее имя остаётся доступным именем для экранных дикторов и следует
  // языку интерфейса.
  await expect(name).toHaveAttribute('aria-label', 'Контекст');
});

test('оболочка показывает панель и переключает настройки', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('section-nav')).toBeVisible();
  await expect(page.getByTestId('workplace-area')).toBeVisible();

  // Полноэкранные настройки: меню разделов скрыто.
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('section-nav')).toBeHidden();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await expect(menu.getByRole('button', { name: 'Общие' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Система' })).toBeVisible();

  await menu.getByRole('button', { name: 'Система' }).click();
  // Раздел «Система» открывается на обновлениях: приложение и плагины —
  // два отдельных раздела.
  await expect(page.locator('main').getByRole('heading', { name: 'Приложение' })).toBeVisible();
  await expect(
    page.locator('main').getByRole('heading', { name: 'Плагины', exact: true }),
  ).toBeVisible();
});

test('разделы меню показывают активный раздел', async ({ page }) => {
  await page.goto('/');

  const libraries = page.getByTestId('nav-library');
  const workspace = page.getByTestId('nav-workspace');

  await expect(workspace).toHaveAttribute('aria-pressed', 'true');
  await expect(libraries).toHaveAttribute('aria-pressed', 'false');

  await libraries.click();
  await expect(libraries).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace).toHaveAttribute('aria-pressed', 'false');

  await workspace.click();
  await expect(workspace).toHaveAttribute('aria-pressed', 'true');
  await expect(libraries).toHaveAttribute('aria-pressed', 'false');

  // Открытие настроек показывает полноэкранный раздел, а меню скрывается.
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await expect(page.getByTestId('section-nav')).toBeHidden();
});

test('при запуске открыт список рабочих мест', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByLabel('Рабочее место', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('workplace-area')).toBeVisible();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('закрытие настроек возвращает к списку рабочих мест', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('workspaces-page')).toBeVisible();

  await page.getByTestId('nav-settings').click();
  await expect(page.getByRole('navigation', { name: 'Разделы настроек' })).toBeVisible();

  await page.getByLabel('Закрыть настройки').click();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
  await expect(page.getByLabel('Рабочее место', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('настройки закрываются клавишей Escape', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings-page')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByTestId('settings-page')).toBeHidden();
  await expect(page.getByTestId('section-nav')).toBeVisible();
});

test('кнопка рабочего места открывает список из раздела библиотеки', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Книги', exact: true }).click();
  // Выбор библиотеки загружает её, книги открываются из панели.
  await page.getByTestId('library-item').first().getByRole('button').first().click();
  await page.getByTestId('library-card-open').click();
  await expect(page.locator('main')).toBeVisible();

  await page.getByLabel('Рабочее место', { exact: true }).click();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('кнопка рабочего места активна только в списке и возвращает к нему', async ({ page }) => {
  await page.goto('/');

  const workspace = page.getByLabel('Рабочее место', { exact: true });

  // Старт: показан список рабочих мест — кнопка нажата.
  await expect(workspace).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('workspaces-page')).toBeVisible();

  // Открытие конкретного места: показаны вкладки, кнопка больше не нажата.
  await page.getByTestId('workspace-open').first().click();
  await expect(page.getByTestId('workplace-tabs')).toBeVisible();
  await expect(workspace).toHaveAttribute('aria-pressed', 'false');

  // Нажатие из открытого места возвращает к списку и снова делает кнопку нажатой.
  await workspace.click();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
  await expect(workspace).toHaveAttribute('aria-pressed', 'true');
});

test('страница библиотек показывает историю с временем', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Книги', exact: true }).click();

  // Навигационный текст в шапке показывает текущий раздел.
  await expect(page.getByTestId('app-context')).toContainText('Книги');
  const entry = page.getByTestId('library-item').filter({ hasText: 'demo-library' }).first();
  await expect(entry).toBeVisible();
  await expect(page.getByText('context', { exact: true }).first()).toBeVisible();
  await expect(entry).toContainText('2023');
});

test('после открытия библиотеки страница выбора закрывается', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Книги', exact: true }).click();
  await page.getByTestId('library-item').first().getByRole('button').first().click();
  await page.getByTestId('library-card-open').click();

  await expect(page.getByTestId('libraries-page')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();
});

test('список книг открывается через раздел «Библиотеки»', async ({ page }) => {
  await page.goto('/');
  await showLibrary(page);

  await expect(page.getByTestId('library-page')).toBeVisible();
});

test('кнопка рабочего места не «отжимается» и не уводит с главной страницы', async ({ page }) => {
  await page.goto('/');

  const workspace = page.getByLabel('Рабочее место', { exact: true });

  // Старт: показан список рабочих мест — кнопка нажата.
  await expect(workspace).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('workspaces-page')).toBeVisible();

  // Повторное нажатие в списке ничего не меняет: список остаётся, кнопка нажата,
  // страница «Библиотека не открыта» не показывается.
  await workspace.click();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
  await expect(workspace).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Библиотека не открыта')).toBeHidden();
});

test('раздел остаётся открытым при повторном нажатии по его кнопке', async ({ page }) => {
  await page.goto('/');

  const libraries = page.getByRole('button', { name: 'Книги', exact: true });
  const notes = page.getByTestId('nav-notes');
  const workspace = page.getByRole('button', { name: 'Рабочее место', exact: true });

  // Раздел «Библиотеки»: повторное нажатие оставляет раздел открытым.
  await libraries.click();
  await expect(page.getByTestId('libraries-page')).toBeVisible();
  await libraries.click();
  await expect(page.getByTestId('libraries-page')).toBeVisible();

  // Раздел «Заметки»: то же поведение.
  await notes.click();
  await expect(page.getByTestId('notes-library')).toBeVisible();
  await notes.click();
  await expect(page.getByTestId('notes-library')).toBeVisible();

  // Возврат к рабочему месту — своей кнопкой.
  await workspace.click();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('список библиотек адаптивен к ширине окна', async ({ page }) => {
  // Узкое окно: страница не даёт горизонтальной прокрутки и показывает поиск.
  await page.setViewportSize({ width: 600, height: 700 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Книги', exact: true }).click();
  await expect(page.getByTestId('libraries-page')).toBeVisible();
  await expect(
    page.getByTestId('libraries-page').getByPlaceholder('Поиск библиотеки'),
  ).toBeVisible();

  const noHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(noHorizontalScroll).toBe(true);

  // Широкое окно: список остаётся вертикальным, действие выстроено в полосе
  // управления над списком, а не колонкой сбоку.
  await page.setViewportSize({ width: 1400, height: 800 });
  const libraries = page.getByTestId('libraries-page');
  const list = libraries.locator('ul', { has: page.getByTestId('library-item') });
  const listBox = await list.boundingBox();
  const controlsBox = await libraries.getByTestId('page-controls').boundingBox();
  expect(listBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(controlsBox!.y).toBeLessThan(listBox!.y);
});

test('реестр заметок и библиотеки используют общую полосу управления', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Книги', exact: true }).click();
  await expect(page.getByTestId('libraries-page').getByTestId('page-controls')).toBeVisible();

  await page.getByTestId('nav-notes').click();
  await expect(page.getByTestId('notes-library').getByTestId('page-controls')).toBeVisible();
});

test('меню разделов показывает разделы вкладками верхней панели', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('/');

  const nav = page.getByTestId('section-nav');
  // Вкладки верхней панели показывают названия разделов.
  await expect(nav).toHaveAttribute('data-mobile', 'false');
  await expect(nav.getByText('Заметки')).toBeVisible();
  await expect(page.getByTestId('nav-notes')).toHaveAttribute('aria-label', 'Заметки');

  // Выбор раздела отмечает вкладку нажатой.
  await page.getByTestId('nav-notes').click();
  await expect(page.getByTestId('nav-notes')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('nav-workspace')).toHaveAttribute('aria-pressed', 'false');
});

test('панель разделов держит вкладки и действия внутри своих границ', async ({ page }) => {
  // Панель разделов не должна обрезать вкладки: их границы внутри панели.
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto('/');

  const bar = page.getByTestId('app-bar');
  const barBox = await bar.boundingBox();
  const nav = page.getByTestId('section-nav');
  const navBox = await nav.boundingBox();
  const settings = page.getByTestId('nav-settings');
  const settingsBox = await settings.boundingBox();
  expect(barBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(settingsBox).not.toBeNull();

  // Служебное действие — справа от вкладок разделов и внутри верхней панели.
  expect(settingsBox!.x).toBeGreaterThanOrEqual(navBox!.x + navBox!.width - 1);
  expect(settingsBox!.x + settingsBox!.width).toBeLessThanOrEqual(barBox!.x + barBox!.width + 1);
  expect(settingsBox!.y + settingsBox!.height).toBeLessThanOrEqual(barBox!.y + barBox!.height + 1);

  // Порядок разделов слева направо: рабочие места, библиотека, заметки.
  const order = await nav
    .getByRole('button')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).getAttribute('aria-label') ?? ''),
    );
  const sections = order.filter((label) => ['Рабочее место', 'Книги', 'Заметки'].includes(label));
  expect(sections).toEqual(['Рабочее место', 'Книги', 'Заметки']);
});

test('на узком окне шапка показывает только имя выбранного, без раздела', async ({ page }) => {
  // Планшетная ширина: меню разделов уже иконками, а название раздела в тексте
  // шапки дублировало бы его и занимало место.
  await page.setViewportSize({ width: 800, height: 800 });
  await page.addInitScript(() => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => ({ path: '/demo-library', provider_name: 'books-source' }),
      },
    };
  });
  await page.goto('/');
  await showLibraryBookList(page);

  // Открыта библиотека: в шапке только имя библиотеки, без названия раздела.
  const context = page.getByTestId('app-context');
  await expect(context).toHaveText('demo-library');
  await expect(context).not.toContainText('Книги');
  // Полный путь остаётся в подсказке.
  await expect(context).toHaveAttribute('title', 'Книги · demo-library');

  // Открыто рабочее место: то же правило.
  const library = page.locator('main');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  const picker = page.getByTestId('workspace-picker-item');
  if (await picker.count()) {
    await picker.first().click();
  }
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');
  // Имя рабочего места здесь совпадает с названием раздела, поэтому проверяется
  // отсутствие разделителя: показывается только выбор, без «раздел · имя».
  await expect(context).not.toContainText('·');
  await expect(context).toHaveAttribute('title', /Рабочее место · /);
});
