import { expect, test } from '@playwright/test';

test('уведомления скрывают технические записи и показывают их по переключателю', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Уведомления').click();

  await expect(page.getByText('Библиотека открыта')).toBeVisible();
  await expect(page.getByText('Плагин пропущен')).toBeHidden();

  await page.getByLabel('Технические').click();

  await expect(page.getByText('Плагин пропущен')).toBeVisible();
  await expect(page.getByText('Ошибка вызова плагина')).toBeVisible();
  await expect(page.getByText('WARN')).toBeVisible();
  await expect(page.getByText('ERROR')).toBeVisible();
});

test('панель уведомлений не выходит за пределы окна', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 });
  await page.goto('/');
  await page.getByLabel('Уведомления').click();

  const aside = page.locator('aside');
  await expect(aside).toBeVisible();
  const box = await aside.boundingBox();
  expect(box).not.toBeNull();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  // Правый край панели в пределах окна.
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);

  // Панель не создаёт горизонтальной прокрутки документа.
  const noHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(noHorizontalScroll).toBe(true);
});

test('панель уведомлений выезжает справа, рядом с содержимым', async ({ page }) => {
  for (const width of [1600, 1000]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/');
    await page.getByLabel('Уведомления').click();

    const viewport = page.viewportSize();
    const asideBox = await page.getByTestId('notifications-panel').boundingBox();
    const mainBox = await page.locator('main').boundingBox();
    expect(viewport).not.toBeNull();
    expect(asideBox).not.toBeNull();
    expect(mainBox).not.toBeNull();

    // Панель справа от содержимого и у правого края окна: элемент управления
    // (колокольчик в верхней панели) и то, чем он управляет, стоят рядом.
    expect(asideBox!.x).toBeGreaterThanOrEqual(mainBox!.x + mainBox!.width - 1);
    expect(asideBox!.x + asideBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
  }
});

test('панель уведомлений начинается от верха контентной области', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 700 });
  await page.goto('/');
  await page.getByLabel('Уведомления').click();

  const panelBox = await page.getByTestId('section-panel').boundingBox();
  const asideBox = await page.getByTestId('notifications-panel').boundingBox();
  expect(panelBox).not.toBeNull();
  expect(asideBox).not.toBeNull();

  // Верхний край панели совпадает с верхом области (не сползает вниз).
  expect(Math.abs(asideBox!.y - panelBox!.y)).toBeLessThanOrEqual(2);
  expect(asideBox!.height).toBeGreaterThan(panelBox!.height);
});
