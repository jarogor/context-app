import { expect, test } from '@playwright/test';

import { showLibraryBookList } from './workplace-area';

/** Ответ активной библиотеки для сценариев адаптивности. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

/** Ширина большого планшета: единственный порог смены компоновки. */
const LARGE_TABLET = 1024;

test.beforeEach(async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: { active_library: () => active },
    };
  }, ACTIVE_LIBRARY);
});

/** Горизонтальная прокрутка документа: её быть не должно ни на одной ширине. */
async function hasHorizontalScroll(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

/**
 * Контрольные ширины: каждая пара — соседние значения по обе стороны порога
 * режима. На границах компоновка переключается один раз и не «пляшет».
 */
const WIDTHS = [360, 480, 767, 768, 1023, LARGE_TABLET, 1439, 1440, 1919, 1920, 2559, 2560];

test('на телефоне разделы уходят в нижнюю навигацию, на большом планшете — в шапку', async ({
  page,
}) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');

    const nav = page.getByTestId('section-nav');
    await expect(nav).toBeVisible();
    const bar = page.getByTestId('app-bar');
    const navBox = await nav.boundingBox();
    const barBox = await bar.boundingBox();
    expect(navBox).not.toBeNull();
    expect(barBox).not.toBeNull();

    const mobile = width < LARGE_TABLET;
    await expect(nav).toHaveAttribute('data-mobile', mobile ? 'true' : 'false');
    if (mobile) {
      // Телефон — не уменьшенный десктоп: меню разделов переезжает в нижнюю
      // полосу, прижатую к нижнему краю экрана.
      expect(navBox!.y).toBeGreaterThanOrEqual(barBox!.y + barBox!.height - 1);
      expect(navBox!.y + navBox!.height).toBeGreaterThanOrEqual(800 - 1);
    } else {
      // Большой планшет и шире: разделы стоят вкладками в верхней панели.
      expect(navBox!.y).toBeLessThan(barBox!.y + barBox!.height + 1);
    }

    // Разделы и служебные действия доступны на любой ширине — ровно один раз:
    // на телефоне они в нижней полосе, в шапке их нет.
    for (const label of ['Рабочее место', 'Книги', 'Заметки', 'Настройки']) {
      await expect(page.getByLabel(label, { exact: true })).toHaveCount(1);
    }
  }
});

test('на телефоне рабочее место занимает всю ширину окна', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  const area = await page.getByTestId('workplace-area').boundingBox();
  expect(area).not.toBeNull();
  // Верхняя панель не делит ширину с содержимым: оно на всю ширину окна.
  expect(Math.abs(area!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(area!.width - 360)).toBeLessThanOrEqual(1);
});

test('все основные экраны без горизонтальной прокрутки на ширинах режимов', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('workspaces-page')).toBeVisible();
    expect(await hasHorizontalScroll(page), `рабочие места ${width}`).toBe(false);

    await showLibraryBookList(page);
    expect(await hasHorizontalScroll(page), `библиотека ${width}`).toBe(false);

    await page.getByTestId('nav-notes').click();
    await expect(page.getByTestId('notes-library')).toBeVisible();
    expect(await hasHorizontalScroll(page), `заметки ${width}`).toBe(false);

    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    expect(await hasHorizontalScroll(page), `настройки ${width}`).toBe(false);
  }
});

test('меню разделов настроек на телефоне — полоса сверху, на большом планшете — колонка', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  const narrow = await menu.boundingBox();
  const page390 = 390;
  expect(narrow).not.toBeNull();
  // На телефоне меню занимает всю ширину области: это полоса, а не колонка.
  expect(narrow!.width).toBeGreaterThan(page390 * 0.6);

  await page.setViewportSize({ width: 1440, height: 800 });
  const wide = await menu.boundingBox();
  expect(wide).not.toBeNull();
  // На десктопе меню — узкая колонка слева.
  expect(wide!.width).toBeLessThan(page390);
});

test('панель заметок на телефоне закрывается кнопкой', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await showLibraryBookList(page);
  const library = page.locator('main');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  const picker = page.getByTestId('workspace-picker-item');
  if (await picker.count()) {
    await picker.first().click();
  }
  await expect(page.getByTestId('workplace-tabs')).toBeVisible();

  // На телефоне панель открывается из меню слева от вкладки.
  await page.getByTestId('workplace-panel-menu').first().click();
  await page.getByRole('menuitem', { name: 'Заметки', exact: true }).click();
  const panel = page.getByTestId('notes-panel');
  await expect(panel).toBeVisible();

  // Панель перекрывает содержимое, поэтому закрывается явной кнопкой.
  await expect(panel.getByTestId('side-panel-close')).toBeVisible();
  await panel.getByTestId('side-panel-close').click();
  await expect(panel).toBeHidden();
});

test('полосы управления не сдвигают основание при появлении соседних блоков', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');

    // Поиск и создание стоят в одной полосе: поле и кнопка на одной высоте.
    const search = await page
      .locator('[data-search-field]')
      .filter({ has: page.getByPlaceholder('Поиск рабочего места') })
      .boundingBox();
    const create = await page.getByRole('button', { name: 'Создать рабочее место' }).boundingBox();
    expect(search, `поиск ${width}`).not.toBeNull();
    expect(create, `создание ${width}`).not.toBeNull();
    expect(Math.abs(search!.y - create!.y), `высота полосы ${width}`).toBeLessThan(4);

    // Появление поля создания не переставляет кнопку: у неё меняется действие,
    // а не место.
    await page.getByRole('button', { name: 'Создать рабочее место' }).click();
    const field = await page.getByPlaceholder('Новое рабочее место').boundingBox();
    expect(field, `поле ${width}`).not.toBeNull();
    const before = await page.getByLabel('Отменить создание').boundingBox();
    await page.getByPlaceholder('Новое рабочее место').fill('Новое');
    const after = await page.getByRole('button', { name: 'Создать рабочее место' }).boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs(before!.x - after!.x), `кнопка ${width}`).toBeLessThan(2);
    expect(Math.abs(before!.y - after!.y), `кнопка ${width}`).toBeLessThan(2);
  }
});

test('горизонтальная ориентация телефона остаётся рабочей', async ({ page }) => {
  // Низкая высота при узкой ширине: содержимое прокручивается, навигация видна.
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/');
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
  await expect(page.getByTestId('nav-notes')).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);
});
