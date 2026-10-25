import { expect, test } from '@playwright/test';

import { bottomReachable } from './scroll';

test('в узком окне раздел настроек прокручивается до нижнего края', async ({ page }) => {
  // Малая высота окна: содержимое настроек выше области, нижний край должен
  // быть достижим прокруткой, а не обрезан.
  await page.setViewportSize({ width: 900, height: 260 });
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('settings-section').first().waitFor();

  const result = await bottomReachable(page, '[data-testid="settings-section"]');
  expect(result.reason ?? '').toBe('');
  expect(result.ok).toBe(true);
  expect(result.scrollTop!).toBeGreaterThan(0);
  expect(result.lastBottom!).toBeLessThanOrEqual(result.scrollerBottom! + 1);
});

test('прокрутка настроек не даёт горизонтальной прокрутки документа', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 260 });
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('settings-section').first().waitFor();

  await bottomReachable(page, '[data-testid="settings-section"]');

  const noHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(noHorizontalScroll).toBe(true);
});

test('страница настроек рендерит секции и поля', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const settings = page.locator('main');
  await expect(settings.getByTestId('settings-group-heading').first()).toBeVisible();
  await expect(settings.getByText('Приветственное уведомление')).toBeVisible();
  await expect(settings.getByText('Порог технических логов')).toBeVisible();
});

test('секция рисуется группой с линией и отступом содержимого', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const heading = page.getByTestId('settings-group-heading').first();
  await expect(heading).toBeVisible();
  // Строку сразу за заголовком продолжает горизонтальная линия.
  await expect(heading.locator('[aria-hidden="true"]')).toBeVisible();
  // Тело группы имеет отступ слева.
  const body = page.getByTestId('settings-group-body').first();
  const padding = await body.evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(Number.parseFloat(padding)).toBeGreaterThan(0);
});

test('поле раскладывается двумя колонками: название слева, контрол справа', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const label = page.locator('main label', { hasText: 'Приветственное уведомление' });
  const labelBox = await label.boundingBox();
  const checkbox = page.locator('main [role="checkbox"]').first();
  const checkboxBox = await checkbox.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(checkboxBox).not.toBeNull();
  // Контрол правее названия, а не под ним.
  expect(checkboxBox!.x).toBeGreaterThan(labelBox!.x + labelBox!.width - 1);
});

test('кнопка сохранения внизу недоступна без правок и включается после', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const settings = page.getByTestId('settings-page');
  const footer = page.getByTestId('settings-footer');
  await expect(footer).toBeVisible();

  // Кнопка сохранения — у правого края нижней панели.
  const pageBox = (await settings.boundingBox())!;
  const saveBox = (await footer.getByRole('button', { name: 'Сохранить' }).boundingBox())!;
  expect(Math.abs(pageBox.x + pageBox.width - (saveBox.x + saveBox.width))).toBeLessThan(40);

  // Без правок кнопка недоступна.
  const save = footer.getByRole('button', { name: 'Сохранить' });
  await expect(save).toBeDisabled();

  // Правка включает кнопку и подсвечивает изменённое поле, возврат — снимает.
  const checkbox = settings.locator('[role="checkbox"]').first();
  const label = settings.locator('label[data-changed]').first();
  await expect(label).toHaveAttribute('data-changed', 'false');

  await checkbox.click();
  await expect(save).toBeEnabled();
  await expect(label).toHaveAttribute('data-changed', 'true');

  await checkbox.click();
  await expect(save).toBeDisabled();
  await expect(label).toHaveAttribute('data-changed', 'false');
});

test('дискретное поле сохраняется по кнопке, а не сразу', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const settings = page.getByTestId('settings-page');
  const checkbox = settings.locator('[role="checkbox"]').first();
  await expect(checkbox).toBeChecked();

  await checkbox.click();
  await expect(checkbox).not.toBeChecked();

  // До нажатия сохранения значение ко входу в поле не применяется (кнопка активна).
  await expect(settings.getByRole('button', { name: 'Сохранить' })).toBeEnabled();

  await settings.getByRole('button', { name: 'Сохранить' }).click();
  await expect(settings.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
});

test('раздел «Информация» показывает версию и расположение конфигов', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await menu.getByRole('button', { name: 'Информация' }).click();

  await expect(page.getByText('версия 0.1.0')).toBeVisible();
  const info = page.getByTestId('app-info-page');
  await expect(info.getByRole('heading', { name: 'Файлы приложения' })).toBeVisible();
  await expect(info.getByText('/home/user/.context/app-state', { exact: true })).toBeVisible();
  // Одно расположение состояния; деления плагинов и жаргона нет.
  await expect(info.locator('li', { hasText: 'Состояние приложения' }).first()).toBeVisible();
  await expect(info.getByText(/в поставке/)).toHaveCount(0);
  await expect(info.getByText('Каркас')).toHaveCount(0);
  await expect(info.getByText('Кэш плагинов')).toHaveCount(0);
});

test('настройки открываются на всё окно без меню разделов', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('section-nav')).toBeVisible();

  await page.getByTestId('nav-settings').click();

  // Меню разделов скрыто, доступны только настройки.
  await expect(page.getByTestId('section-nav')).toBeHidden();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  // Кнопка закрытия — в шапке настроек.
  await expect(page.getByLabel('Закрыть настройки')).toBeVisible();
  // Внутреннее меню разделов настроек осталось.
  await expect(
    page.getByRole('navigation', { name: 'Разделы настроек' }),
  ).toBeVisible();
});

test('настройки открываются отдельной страницей, без панели уведомлений', async ({ page }) => {
  await page.goto('/');
  // Панель уведомлений открыта — это область рядом с содержимым.
  await page.getByLabel('Уведомления').click();
  await expect(page.getByTestId('notifications-panel')).toBeVisible();

  await page.getByTestId('nav-settings').click();

  // Настройки — отдельная страница на всё окно: панель уведомлений скрыта,
  // а не делит место с настройками.
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await expect(page.getByTestId('notifications-panel')).toBeHidden();

  // Закрытие настроек возвращает прежнюю область вместе с её панелью.
  await page.getByLabel('Закрыть настройки').click();
  await expect(page.getByTestId('notifications-panel')).toBeVisible();
});

test('повторные клики в точку закрытия не открывают настройки заново', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  const settings = page.getByTestId('settings-page');
  await expect(settings).toBeVisible();

  // Смена темы, сохранение и сразу закрытие: пока запись идёт, пользователь
  // повторяет нажатие в ту же точку (кнопки закрытия и настроек совмещены).
  await page.getByRole('button', { name: 'Тема оформления' }).click();
  await page.getByRole('option', { name: 'Тёмная' }).click();
  await settings.getByRole('button', { name: 'Сохранить' }).click();

  const close = page.getByLabel('Закрыть настройки');
  const box = await close.boundingBox();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.click(x, y);
  await page.waitForTimeout(30);
  await page.mouse.click(x, y);
  await page.waitForTimeout(30);
  await page.mouse.click(x, y);

  // Раздел закрыт и не открылся от «догоняющих» нажатий.
  await expect(settings).toBeHidden();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('кнопка закрытия доступна с любой страницы настроек', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  // Закрытие есть и на «Плагинах», и на «Информации», а не только на «Общих».
  await menu.getByRole('button', { name: 'Плагины' }).click();
  await expect(page.getByLabel('Закрыть настройки')).toBeVisible();

  await menu.getByRole('button', { name: 'Информация' }).click();
  await expect(page.getByLabel('Закрыть настройки')).toBeVisible();

  await page.getByLabel('Закрыть настройки').click();
  await expect(page.getByTestId('settings-page')).toBeHidden();
});

test('кнопка закрытия и Escape возвращают прежнюю область', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('workspaces-page')).toBeVisible();

  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('section-nav')).toBeHidden();
  await page.getByLabel('Закрыть настройки').click();
  await expect(page.getByTestId('section-nav')).toBeVisible();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
  // Намеренное переоткрытие — после паузы: короткие «догоняющие» клики в ту же
  // точку экрана (кнопки закрытия и настроек совмещены) приложение гасит.
  await page.waitForTimeout(1300);

  // Escape закрывает раздел тем же действием.
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('section-nav')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-page')).toBeHidden();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
});

test('поле настроек имеет акцентное название и мелкое пояснение под контролом', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const nameLabel = page.locator('main label', { hasText: 'Приветственное уведомление' });
  const nameFont = await nameLabel.evaluate((el) => getComputedStyle(el).fontSize);
  const nameColor = await nameLabel.evaluate((el) => getComputedStyle(el).color);

  const description = page.locator('main p').filter({ hasText: 'Показывать приветствие' });
  await expect(description).toBeVisible();
  const descFont = await description.evaluate((el) => getComputedStyle(el).fontSize);
  const descColor = await description.evaluate((el) => getComputedStyle(el).color);

  // Название крупнее пояснения, и цвет у них разный (акцент против приглушённого).
  expect(Number.parseFloat(nameFont)).toBeGreaterThan(Number.parseFloat(descFont));
  expect(nameColor).not.toBe(descColor);
});
