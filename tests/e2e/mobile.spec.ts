import { expect, test, devices } from '@playwright/test';

/**
 * Режим смартфона и планшета.
 *
 * Проверяется настоящая эмуляция устройства, а не только узкая ширина окна:
 * `devices[...]` включает грубый указатель (`pointer: coarse`), сенсорный ввод
 * и безопасные зоны экрана — именно они меняют размеры кнопок и положение
 * нижней навигации. Тест на одной ширине окна этого не ловит.
 */

/** Устройства, на которых включается телефонная компоновка. */
const PHONES = ['iPhone SE', 'iPhone 13', 'Pixel 5', 'iPad Mini'];

test('на телефоне меню разделов переезжает в нижнюю навигацию', async ({ page }) => {
  for (const name of PHONES) {
    const device = devices[name];
    await page.setViewportSize({ width: device.viewport.width, height: device.viewport.height });
    await page.goto('/');
    await page.getByTestId('app-bar').waitFor();

    const nav = page.getByTestId('section-nav');
    await expect(nav).toHaveAttribute('data-mobile', 'true');
    await expect(nav).toBeVisible();

    // Нижняя полоса прижата к нижнему краю экрана.
    const navBox = await nav.boundingBox();
    const viewport = page.viewportSize()!;
    expect(navBox).not.toBeNull();
    expect(navBox!.y + navBox!.height).toBeGreaterThanOrEqual(viewport.height - 1);

    // В верхней панели разделов нет: активна ровно одна компоновка меню.
    const bar = page.getByTestId('app-bar');
    const barBox = await bar.boundingBox();
    expect(barBox).not.toBeNull();
    expect(navBox!.y).toBeGreaterThanOrEqual(barBox!.y + barBox!.height - 1);
    await expect(bar.getByTestId('nav-workspace')).toHaveCount(0);
  }
});

test('на телефоне нижняя навигация даёт все разделы и служебные действия', async ({ page }) => {
  for (const name of PHONES) {
    const device = devices[name];
    await page.setViewportSize({ width: device.viewport.width, height: device.viewport.height });
    await page.goto('/');
    await page.getByTestId('app-bar').waitFor();

    for (const label of ['Рабочее место', 'Библиотека', 'Заметки', 'Настройки']) {
      await expect(
        page.getByTestId('section-nav').getByLabel(label, { exact: true }),
      ).toBeVisible();
    }
    // Тема тоже доступна с телефона — кнопка в шапке туда не помещается.
    await expect(page.getByTestId('section-nav').getByTestId('nav-theme')).toBeVisible();
  }
});

test.describe('сенсорный экран', () => {
  test('пункты нижней навигации — сенсорные цели не меньше 44px', async ({ browser }) => {
    // Грубый указатель — свойство устройства, а не ширины окна: `setViewportSize`
    // его не включает, поэтому контекст создаётся с эмуляцией телефона.
    const context = await browser.newContext({ ...devices['iPhone SE'] });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('app-bar').waitFor();

    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    expect(coarse).toBe(true);

    const heights = await page
      .getByTestId('section-nav')
      .getByRole('button')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThanOrEqual(5);
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(43.5);
    }
    await context.close();
  });
});

test('нижняя навигация не растягивается на всю высоту области', async ({ page }) => {
  const device = devices['iPhone 13'];
  await page.setViewportSize({ width: device.viewport.width, height: device.viewport.height });
  await page.goto('/');
  await page.getByTestId('app-bar').waitFor();

  // Полоса занимает только нижний край: её высота много меньше экрана, а
  // контент раздела остаётся доступен над ней.
  const navBox = await page.getByTestId('section-nav').boundingBox();
  expect(navBox).not.toBeNull();
  expect(navBox!.height).toBeLessThan(120);
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('на телефоне разделы открываются из нижней навигации', async ({ page }) => {
  const device = devices['Pixel 5'];
  await page.setViewportSize({ width: device.viewport.width, height: device.viewport.height });
  await page.goto('/');
  await page.getByTestId('app-bar').waitFor();

  const nav = page.getByTestId('section-nav');

  await nav.getByTestId('nav-library').click();
  await expect(nav.getByTestId('nav-library')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('libraries-page')).toBeVisible();

  await nav.getByTestId('nav-notes').click();
  await expect(nav.getByTestId('nav-notes')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('notes-library')).toBeVisible();

  await nav.getByTestId('nav-workspace').click();
  await expect(nav.getByTestId('nav-workspace')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('на телефоне из нижней навигации работают тема и настройки', async ({ page }) => {
  const device = devices['iPhone 13'];
  await page.setViewportSize({ width: device.viewport.width, height: device.viewport.height });
  await page.goto('/');
  await page.getByTestId('app-bar').waitFor();

  const nav = page.getByTestId('section-nav');

  const themeBefore = await page.locator('html').getAttribute('data-theme');
  await nav.getByTestId('nav-theme').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', themeBefore!);

  await nav.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  // В полноэкранных настройках своя шапка с закрытием — нижнее меню скрыто.
  await expect(page.getByTestId('section-nav')).toBeHidden();
});

test('на телефоне нет горизонтальной прокрутки ни в одном разделе', async ({ page }) => {
  for (const name of ['iPhone SE', 'iPad Mini']) {
    const device = devices[name];
    await page.setViewportSize({ width: device.viewport.width, height: device.viewport.height });
    for (const section of ['workspace', 'library', 'notes', 'settings']) {
      await page.goto('/');
      await page.getByTestId('app-bar').waitFor();
      if (section !== 'workspace') {
        await page.getByTestId(`nav-${section}`).click();
        await page.waitForTimeout(200);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, `${name} / ${section}`).toBe(false);
    }
  }
});

test('на планшете в нижней полосе видны короткие подписи разделов', async ({ page }) => {
  const device = devices['iPad Mini'];
  await page.setViewportSize({ width: device.viewport.width, height: device.viewport.height });
  await page.goto('/');
  await page.getByTestId('app-bar').waitFor();

  // Широкий телефон и планшет показывают подписи под иконками, узкий — только
  // иконки: полоса обязана помещаться по ширине.
  const workspace = page.getByTestId('section-nav').getByTestId('nav-workspace');
  await expect(workspace).toContainText('Место');
  await expect(page.getByTestId('section-nav').getByTestId('nav-library')).toContainText('Книги');
});
