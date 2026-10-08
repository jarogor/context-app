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

test('панель уведомлений не пересекает верхнюю панель', async ({ page }) => {
  for (const width of [1600, 1000, 700]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/');
    await page.getByLabel('Уведомления').click();

    const headerBox = await page.locator('header').boundingBox();
    const asideBox = await page.locator('aside').boundingBox();
    expect(headerBox).not.toBeNull();
    expect(asideBox).not.toBeNull();

    // Верхний край панели ниже нижнего края шапки.
    expect(asideBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
  }
});
