import { expect, test, type Page } from '@playwright/test';
import { addBookToWorkspace, openWorkspaceArea } from './workplace-area';
import { mockFlowingBook } from './plugin-viewer';

/** Открытие книги во вкладке рабочего места. */
async function openBook(page: Page, title: RegExp | string = /Демо-книга/): Promise<void> {
  await page.goto('/');
  await openWorkspaceArea(page);
  await addBookToWorkspace(page, title);
  const text = typeof title === 'string' ? title : title.source.replace(/[\\^$.*+?()[\]{}|]/g, '');
  await expect(page.getByTestId('workplace-tab')).toContainText(text);
}

/** Область содержимого книги, нарисованная плагином. */
function content(page: Page) {
  return page.frameLocator('iframe[title="Содержимое книги"]');
}

test('книгу текучего формата рисует плагин формата, а не оболочка', async ({ page }) => {
  await mockFlowingBook(page, 'epub', [
    {
      title: 'Глава 1',
      html: '<h1>Заголовок главы</h1><p>Первый абзац книги.</p>',
    },
  ]);
  await openBook(page);

  // Текст главы нарисован модулем рисования плагина: содержимое живёт в его
  // песочнице, а не в компоненте оболочки.
  await expect(content(page).getByText('Первый абзац книги.')).toBeVisible();
  await expect(content(page).getByText('Заголовок главы')).toBeVisible();

  const sizes = await content(page)
    .locator('body')
    .evaluate((body) => {
      const doc = body.ownerDocument;
      const size = (selector: string) => {
        const element = doc.querySelector(selector);
        return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
      };
      return { title: size('h1'), paragraph: size('p') };
    });
  expect(sizes.title).toBeGreaterThan(sizes.paragraph * 1.5);
});

test('книга FB2 открывается своим плагином формата', async ({ page }) => {
  await mockFlowingBook(page, 'fb2', [
    { title: 'Глава FB2', html: '<h1>Глава FB2</h1><p>Текст FB2.</p>' },
  ]);
  // Книга каталога с файлом FB2: формат выбирает плагин своего формата.
  await openBook(page, 'Вторая книга');

  await expect(content(page).getByText('Текст FB2.')).toBeVisible();
  await expect(content(page).getByText('Глава FB2')).toBeVisible();
});
