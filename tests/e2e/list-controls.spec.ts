import { expect, test } from '@playwright/test';

/**
 * Полосы управления рабочих мест и реестра заметок — как в списках библиотек:
 * слева главное действие, затем поиск, справа порядок и (у рабочих мест) режим.
 */
test('рабочие места: создание слева, поиск, справа порядок и режим', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByTestId('workspaces-page').waitFor();

  const controls = page.getByTestId('workspaces-controls');
  const create = controls.getByRole('button', { name: 'Создать рабочее место' });
  const search = controls.locator('[data-search-field]');
  const sort = controls.getByTestId('workspaces-sort');
  const mode = controls.getByRole('group', { name: 'Режим показа' });

  await expect(create).toBeVisible();
  await expect(search).toBeVisible();
  await expect(sort).toBeVisible();
  await expect(mode).toBeVisible();

  const [createBox, searchBox, sortBox] = await Promise.all([
    create.boundingBox(),
    search.boundingBox(),
    sort.boundingBox(),
  ]);
  expect(createBox!.x).toBeLessThan(searchBox!.x);
  expect(searchBox!.x).toBeLessThan(sortBox!.x);
  // Верх совпадает: полоса в одну строку.
  expect(Math.abs(createBox!.y - searchBox!.y)).toBeLessThan(4);
  expect(Math.abs(searchBox!.y - sortBox!.y)).toBeLessThan(4);
});

test('рабочие места: списочный режим показывает строки, плитка — карточки', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('workspaces-view-mode', 'grid'));
  await page.goto('/');
  await page.getByTestId('workspaces-page').waitFor();

  // По умолчанию — плитка.
  await expect(page.getByTestId('workspaces-grid')).toBeVisible();
  await expect(page.getByTestId('workspace-meta')).toBeVisible();

  await page.getByRole('button', { name: 'Список' }).click();
  await expect(page.getByTestId('workspaces-grid')).toHaveCount(0);
  await expect(page.getByTestId('workspace-item')).toHaveCount(1);
  // Строка показывает метаинформацию: книг и вкладок.
  await expect(page.getByTestId('workspace-meta')).toBeVisible();
  await expect(page.getByTestId('workspace-book-count')).toBeVisible();

  await page.getByRole('button', { name: 'Плитка' }).click();
  await expect(page.getByTestId('workspaces-grid')).toBeVisible();
});

test('заметки: импорт слева, поиск, справа порядок', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByTestId('nav-notes').click();
  await page.getByTestId('notes-library').waitFor();

  const importButton = page.getByRole('button', { name: 'Импорт' });
  const search = page
    .locator('[data-search-field]')
    .filter({ has: page.getByPlaceholder('Поиск по заметкам') });
  const sort = page.getByTestId('notes-library-sort');

  const [importBox, searchBox, sortBox] = await Promise.all([
    importButton.boundingBox(),
    search.boundingBox(),
    sort.boundingBox(),
  ]);
  expect(importBox!.x).toBeLessThan(searchBox!.x);
  expect(searchBox!.x).toBeLessThan(sortBox!.x);
});

test('рабочие места: на планшете режим вида доступен, на телефоне полоса переносится', async ({
  page,
}) => {
  for (const [width, label] of [
    [1023, 'маленький планшет'],
    [768, 'планшет'],
  ] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByTestId('workspaces-page').waitFor();

    const controls = page.getByTestId('workspaces-controls');
    // Дефект: переключатель вида исчезал вместе с телефонной навигацией.
    await expect(controls.getByRole('group', { name: 'Режим показа' }), label).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Список' }), label).toBeVisible();

    // Переключение действительно работает.
    await controls.getByRole('button', { name: 'Список' }).click();
    await expect(page.getByTestId('workspaces-grid'), label).toHaveCount(0);
    await controls.getByRole('button', { name: 'Плитка' }).click();
    await expect(page.getByTestId('workspaces-grid'), label).toBeVisible();
  }

  // Телефон: порядок и режим уходят на свою строку, а не сжимаются.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByTestId('workspaces-page').waitFor();
  const controls = page.getByTestId('workspaces-controls');
  const search = controls.locator('[data-search-field]');
  const sort = controls.getByTestId('workspaces-sort');
  const [searchBox, sortBox] = await Promise.all([search.boundingBox(), sort.boundingBox()]);
  expect(searchBox).not.toBeNull();
  expect(sortBox).not.toBeNull();
  // Порядок стоит ниже поиска на отдельной строке.
  expect(sortBox!.y).toBeGreaterThan(searchBox!.y + searchBox!.height);

  // Горизонтальной прокрутки нет: полоса не вылезает за окно.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});

test('заметки: на телефоне порядок уходит на вторую строку', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByTestId('nav-notes').click();
  await page.getByTestId('notes-library').waitFor();

  const search = page
    .locator('[data-search-field]')
    .filter({ has: page.getByPlaceholder('Поиск по заметкам') });
  const sort = page.getByTestId('notes-library-sort');
  const [searchBox, sortBox] = await Promise.all([search.boundingBox(), sort.boundingBox()]);
  expect(searchBox).not.toBeNull();
  expect(sortBox).not.toBeNull();
  expect(sortBox!.y).toBeGreaterThan(searchBox!.y + searchBox!.height);
});
