import { expect, test } from '@playwright/test';

test('лента показывает только события, адресованные пользователю', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Уведомления').click();

  // Лента — про понятные пользователю события: техническая диагностика живёт
  // в файле для поддержки и в ленту не попадает.
  await expect(page.getByText('Библиотека открыта')).toBeVisible();
  await expect(page.getByText('Плагин пропущен')).toBeHidden();
  await expect(page.getByText('Ошибка вызова плагина')).toBeHidden();
  // Переключателя технических записей больше нет.
  await expect(page.getByLabel('Технические')).toHaveCount(0);
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

  // Панель идёт от верха контентной области: её верхний край совпадает с верхом
  // области рабочего места, а низ — с низом области (панели раздела под шапкой
  // больше нет).
  const areaBox = await page.getByTestId('workplace-area').boundingBox();
  const asideBox = await page.getByTestId('notifications-panel').boundingBox();
  expect(areaBox).not.toBeNull();
  expect(asideBox).not.toBeNull();

  expect(Math.abs(asideBox!.y - areaBox!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(asideBox!.y + asideBox!.height - (areaBox!.y + areaBox!.height))).toBeLessThanOrEqual(
    2,
  );
});
