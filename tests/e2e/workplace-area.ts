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
 * Раздел «Библиотека» открывается кнопкой меню разделов и всегда показывает
 * список библиотек. Выбираем библиотеку — раздел сразу показывает список книг.
 */
export async function showLibraryBookList(page: Page) {
  await page.getByLabel('Библиотека', { exact: true }).click();
  const sources = page.getByTestId('libraries-page');
  const books = page.getByTestId('library-page');
  // Раздел показывает список библиотек; открытие библиотеки сменяет его списком
  // книг. Ждём, пока раздел определится, и выбираем библиотеку, если виден список.
  await Promise.race([
    books.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined),
    sources.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined),
  ]);
  if (await sources.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /demo-library/ }).click();
  }
  await expect(books).toBeVisible();
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
  // На узком окне кнопки открытия книги живут в меню панелей: в полосе их нет.
  const addButton = page.getByRole('button', { name: /Добавить книгу/ });
  if ((await addButton.count()) > 0 && (await addButton.first().isVisible())) {
    await addButton.first().click();
  } else {
    await page.getByTestId('workplace-panel-menu').first().click();
    await page.getByRole('menuitem', { name: /Добавить книгу/ }).click();
  }
  const library = page.locator('main');
  const back = library.getByRole('button', { name: /К списку книг/ });
  if ((await back.count()) > 0) {
    await back.click();
  }
  await library.getByRole('button', { name: title }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  await expect(page.getByTestId('workplace-area')).toBeVisible();
}
