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
  await expect(settings.getByText('Язык интерфейса')).toBeVisible();
  await expect(settings.getByText('Тема оформления')).toBeVisible();
  // Технический порог вынесен в раздел «Система»: в общих настройках его нет.
  await expect(settings.getByText('Подробность журнала для разбора проблем')).toHaveCount(0);
});

test('порядок полей: сперва язык, затем тема, затем остальное', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  // Язык меняет подписи всех остальных полей, поэтому он идёт первым; тема —
  // второе оформление.
  const labels = await page.locator('main label:visible').allTextContents();
  const order = labels.map((text) => text.trim());
  expect(order[0]).toBe('Язык интерфейса');
  expect(order[1]).toBe('Тема оформления');
});

test('диагностика не имеет настроек в разделе «Система»', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await menu.getByRole('button', { name: 'Система' }).click();

  // Раздел — про обновления и сведения о приложении. Журнал пишется всегда,
  // поэтому настраивать в нём нечего: решение «что записывать» не для человека.
  await expect(page.getByText('Приложение', { exact: true })).toBeVisible();
  await expect(page.getByText('Плагины', { exact: true })).toBeVisible();
  await expect(page.getByTestId('app-info-page')).toBeVisible();
  await expect(page.getByText('Подробность журнала для разбора проблем')).toHaveCount(0);
});

test('журнал для разбора находится в сведениях о приложении', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  await page.getByRole('navigation', { name: 'Разделы настроек' })
    .getByRole('button', { name: 'Система' })
    .click();

  // Пользователю нужно не настраивать журнал, а найти файл, чтобы приложить его
  // к обращению: путь и кнопка открытия папки стоят в сведениях о приложении.
  const log = page.getByTestId('app-path-diagnostics');
  await expect(log).toContainText('diagnostics.log');
  await expect(log.getByRole('button', { name: 'Открыть' })).toBeVisible();
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

  const label = page.locator('main label', { hasText: 'Тема оформления' });
  const labelBox = await label.boundingBox();
  // Контрол поля «Тема оформления» — выпадающий список дизайн-системы.
  const checkbox = page
    .locator('main [data-testid="settings-group-body"]')
    .locator('button')
    .first();
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

  // Кнопка сохранения — в карточке панели, у правого края общей колонки
  // контента: отступ карточки тот же, что у секций настроек.
  const pageBox = (await settings.boundingBox())!;
  const saveBox = (await footer.getByRole('button', { name: 'Сохранить' }).boundingBox())!;
  expect(pageBox.x + pageBox.width - (saveBox.x + saveBox.width)).toBeLessThan(80);

  // Без правок кнопка недоступна.
  const save = footer.getByRole('button', { name: 'Сохранить' });
  await expect(save).toBeDisabled();

  // Правка включает кнопку и подсвечивает изменённое поле, возврат — снимает.
  const theme = settings
    .locator('[data-testid="settings-group-body"] button')
    .nth(1);
  // Подсветка — у той метки, чьё поле меняется, а не у первой в секции.
  const label = settings.locator('label[data-changed]', { hasText: 'Тема оформления' });
  const current = (await theme.textContent())?.trim() ?? '';
  expect(label).toHaveAttribute('data-changed', 'false');

  await theme.click();
  await page.getByRole('option', { name: current === 'Тёмная' ? 'Светлая' : 'Тёмная' }).click();
  await expect(save).toBeEnabled();
  await expect(label).toHaveAttribute('data-changed', 'true');

  await theme.click();
  await page.getByRole('option', { name: current }).click();
  await expect(save).toBeDisabled();
  await expect(label).toHaveAttribute('data-changed', 'false');
});

test('дискретное поле сохраняется по кнопке, а не сразу', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const settings = page.getByTestId('settings-page');
  // Поле-список меняется через выбор варианта: только он и сохраняется кнопкой.
  await settings.locator('[data-testid="settings-group-body"] button').first().click();
  await page.getByRole('option', { name: 'English' }).click();

  // До нажатия сохранения значение ко входу в поле не применяется (кнопка активна).
  await expect(settings.getByRole('button', { name: 'Сохранить' })).toBeEnabled();

  await settings.getByRole('button', { name: 'Сохранить' }).click();
  await expect(settings.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
});

test('раздел «Система» показывает версию и расположение конфигов', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  await menu.getByRole('button', { name: 'Система' }).click();

  await expect(page.getByText('Приложение', { exact: true })).toBeVisible();
  await expect(page.locator('main').getByText('0.1.0', { exact: true }).first()).toBeVisible();
  const info = page.getByTestId('app-info-page');
  await expect(info.getByText('Служебные данные приложения')).toBeVisible();
  await expect(info.getByText('/home/user/.context', { exact: true })).toBeVisible();
  // Одно расположение данных; деления плагинов и жаргона нет.
  await expect(info.getByText('Настройки, плагины, кеш и обновления')).toBeVisible();
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

test('кнопка закрытия доступна с любой страницы настроек', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  const menu = page.getByRole('navigation', { name: 'Разделы настроек' });
  // Закрытие есть на любой странице настроек, а не только на «Общих».
  await menu.getByRole('button', { name: 'Система' }).click();
  await expect(page.getByLabel('Закрыть настройки')).toBeVisible();

  await menu.getByRole('button', { name: 'Общие' }).click();
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

  // Пояснение проверяется на поле, у которого оно есть: у темы и языка его нет —
  // там всё понятно из названия.
  const nameLabel = page.locator('main label', { hasText: 'Палитра оформления' });
  const nameFont = await nameLabel.evaluate((el) => getComputedStyle(el).fontSize);
  const nameColor = await nameLabel.evaluate((el) => getComputedStyle(el).color);

  const description = page.locator('main p').filter({ hasText: 'Набор светлых и тёмных цветов' });
  await expect(description).toBeVisible();
  const descFont = await description.evaluate((el) => getComputedStyle(el).fontSize);
  const descColor = await description.evaluate((el) => getComputedStyle(el).color);

  // Название крупнее пояснения, и цвет у них разный (акцент против приглушённого).
  expect(Number.parseFloat(nameFont)).toBeGreaterThan(Number.parseFloat(descFont));
  expect(nameColor).not.toBe(descColor);
});

test('у переключения темы нет описания: название говорит само за себя', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();

  // Описание на абзац дублировало поведение и мешало найти сам переключатель.
  await expect(page.locator('main p').filter({ hasText: 'Светлая или тёмная тема' })).toHaveCount(0);
  await expect(page.locator('main label', { hasText: 'Тема оформления' })).toBeVisible();
});
