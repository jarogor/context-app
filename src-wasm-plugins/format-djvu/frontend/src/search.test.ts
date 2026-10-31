import { beforeEach, describe, expect, it } from 'vitest';

import { pagesEl } from './dom';
import {
  clearSearchMarks,
  markPage,
  normalizeSearchText,
  pageTextOf,
  resetSearchTexts,
  SEARCH_ACTIVE_CLASS,
  SEARCH_HIT_CLASS,
  searchBook,
  searchSession,
  stepSearch,
} from './search';
import { state } from './state';

/** Отрисованная страница с текстовым слоем из слов. */
function page(number: number, words: string[]): HTMLElement {
  const pageEl = document.createElement('div');
  pageEl.className = 'page';
  pageEl.dataset.page = String(number);
  const layer = document.createElement('div');
  layer.className = 'textLayer';
  for (const word of words) {
    const span = document.createElement('span');
    span.textContent = word;
    layer.append(span);
  }
  pageEl.append(layer);
  pagesEl.append(pageEl);
  return pageEl;
}

/** Документ DjVu с текстовыми зонами страниц.
 *
 * У страниц есть размеры и DPI: переход к вхождению прокручивает книгу по
 * странице, и без них поиск падал бы на переходе, а не проверял его.
 */
function fakeDocument(pages: string[][]): void {
  state.pageCount = pages.length;
  state.defaultSize = { width: 600, height: 800 };
  state.naturalSizes = pages.map(() => ({ width: 600, height: 800 }));
  state.doc = {
    page_count: () => pages.length,
    page: (index: number) => ({
      dpi: () => 300,
      width_at: () => 600,
      height_at: () => 800,
      text_zones_json: () =>
        JSON.stringify(pages[index].map((t, i) => ({ t, x: 0, y: i, w: 100, h: 10 }))),
    }),
  } as never;
}

beforeEach(() => {
  pagesEl.replaceChildren();
  resetSearchTexts();
  state.doc = null;
  state.pageCount = 0;
});

describe('поиск в модуле рисования DjVu', () => {
  it('находит фразу по зонам соседних слов и считает вхождения по книге', () => {
    fakeDocument([
      ['Искомое', 'слово', 'в', 'тексте'],
      ['искомое', 'слово'],
    ]);

    searchBook('искомое слово');

    expect(searchSession.hits).toEqual([
      { page: 1, ordinal: 0 },
      { page: 2, ordinal: 0 },
    ]);
    expect(searchSession.index).toBe(0);
    expect(normalizeSearchText(' Искомое \n Слово ')).toBe('искомое слово');
    expect(pageTextOf(['Искомое', ' ', 'слово'])).toBe('искомое слово');
  });

  it('переходит по кругу, показывает первое вхождение и снимает подсветку', () => {
    const pageEl = page(1, ['слово', 'и', 'слово']);
    fakeDocument([['слово', 'и', 'слово']]);
    searchBook('слово');

    // Первое найденное показано сразу, а не только после перехода.
    expect(searchSession.hits).toHaveLength(2);
    expect(pageEl.querySelector(`.${SEARCH_ACTIVE_CLASS}`)?.textContent).toBe('слово');

    stepSearch(1);
    expect(searchSession.index).toBe(1);
    stepSearch(-1);
    expect(searchSession.index).toBe(0);

    // Подсветка всех вхождений страницы и снятие без следа.
    markPage(pageEl);
    expect(document.querySelectorAll(`mark.${SEARCH_HIT_CLASS}`).length).toBeGreaterThan(0);
    clearSearchMarks();
    expect(document.querySelector(`.${SEARCH_HIT_CLASS}`)).toBeNull();
    expect(pagesEl.textContent).toBe('словоислово');

    // Пустой запрос снимает результат; без вхождений переход ничего не делает.
    searchBook('   ');
    expect(searchSession.hits).toHaveLength(0);
    expect(searchSession.index).toBeNull();
    stepSearch(1);
    expect(searchSession.index).toBeNull();
  });
});
