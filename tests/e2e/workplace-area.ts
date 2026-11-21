import { expect, type Page } from '@playwright/test';

/** Кнопка-иконка рабочего места в верхней панели оболочки. */
export function workspaceButton(page: Page) {
  return page.getByLabel('Рабочее место', { exact: true });
}

/** Область рабочего места: список рабочих мест или вкладки открытого места. */
export function workspaceArea(page: Page) {
  return page.getByTestId('workplace-area');
}

/**
 * Видна ли область рабочего места.
 *
 * Проверяется именно видимость области, а не нажатость кнопки в шапке:
 * кнопка активна только в списке рабочих мест, поэтому по ней нельзя судить,
 * открыт ли раздел вообще.
 */
export async function workspaceAreaVisible(page: Page): Promise<boolean> {
  return workspaceArea(page)
    .isVisible()
    .catch(() => false);
}

/** Открытие раздела рабочего места, если он скрыт.
 *
 * Кнопка рабочего места всегда приводит к списку рабочих мест: когда раздел
 * скрыт (открыт другой), нажатие показывает список, а когда раздел уже открыт —
 * ничего не меняет.
 */
export async function openWorkspaceArea(page: Page) {
  // Готовность оболочки: до её монтирования кнопки и области ещё нет,
  // поэтому проверка видимости до готовности дала бы ложное «скрыто».
  await workspaceButton(page).waitFor({ state: 'visible' });
  if (!(await workspaceAreaVisible(page))) {
    await workspaceButton(page).click();
  }
  await expect(workspaceArea(page)).toBeVisible();
}

/** Показ списка книг библиотеки.
 *
 * Раздел «Библиотека» открывает книги активной библиотеки, а список библиотек —
 * только когда библиотека ещё не выбрана (или после кнопки «Библиотеки» в полосе
 * управления). Выбор библиотеки в списке только загружает её и показывает
 * сведения в панели; книги открываются нажатием на название в панели.
 */
export async function showLibraryBookList(page: Page) {
  await page.getByLabel('Книги', { exact: true }).click();
  const sources = page.getByTestId('libraries-page');
  const books = page.getByTestId('library-page');
  // Раздел показывает список библиотек; открытие библиотеки сменяет его списком
  // книг. Ждём, пока раздел определится, и выбираем библиотеку, если виден список.
  await Promise.race([
    books.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined),
    sources.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined),
  ]);
  if (await sources.isVisible().catch(() => false)) {
    // Строка списка — кнопка внутри пункта; название в панели тоже кнопка с тем
    // же именем, поэтому выбор идёт по пункту списка.
    await page
      .getByTestId('library-item')
      .filter({ hasText: 'demo-library' })
      .getByRole('button')
      .first()
      .click();
    await page.getByTestId('library-card-open').click();
  }
  await expect(books).toBeVisible();
}

/** Панель списка открытых вкладок. */
export function booksPanel(page: Page) {
  return page.getByTestId('open-books-panel');
}

/** Показ панели списка вкладок, если она скрыта.
 *
 * Список вкладок — единственное место, где виден весь состав рабочего места,
 * поэтому панель открыта по умолчанию: нажатие кнопки без проверки закрыло бы
 * её, и список пропал бы.
 */
export async function ensureBooksPanel(page: Page) {
  if (
    !(await booksPanel(page)
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  }
  await expect(booksPanel(page)).toBeVisible();
}

/** Скрытие панели списка вкладок, если она показана. */
export async function hideBooksPanel(page: Page) {
  if (
    await booksPanel(page)
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  }
  await expect(booksPanel(page)).toHaveCount(0);
}

/** Добавление книги вкладкой в текущее рабочее место.
 *
 * Открывает раздел рабочего места, затем список книг кнопкой «Добавить книгу»
 * (это и есть штатный вход в список книг), выбирает книгу по названию и
 * добавляет её вкладкой.
 */
export async function addBookToWorkspace(page: Page, title: string | RegExp) {
  await openWorkspaceArea(page);
  const open = page.getByTestId('workspace-open').first();
  if (await open.isVisible().catch(() => false)) {
    await open.click();
  }
  // Добавление книги живёт в панели вкладок. На узком окне панель закрыта по
  // умолчанию — сначала открываем её.
  if (
    !(await page
      .getByTestId('open-books-panel')
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByRole('button', { name: 'Вкладки', exact: true }).click();
  }
  await page
    .getByRole('button', { name: /Добавить книгу/ })
    .first()
    .click();
  const library = page.locator('main');
  const back = library.getByRole('button', { name: /К списку книг/ });
  if ((await back.count()) > 0) {
    await back.click();
  }
  await library.getByRole('button', { name: title }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  await expect(page.getByTestId('workplace-area')).toBeVisible();
}
