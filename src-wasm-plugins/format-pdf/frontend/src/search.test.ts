import { beforeEach, describe, expect, it } from 'vitest';

import { pagesEl } from './dom';
import {
  clearSearchMarks,
  markPage,
  normalizeSearchText,
  resetSearchTexts,
  searchBook,
  SEARCH_ACTIVE_CLASS,
  SEARCH_HIT_CLASS,
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

/** Документ с текстом страниц для поиска без отрисовки. */
function fakeDocument(pages: string[][]): void {
  state.pageCount = pages.length;
  state.doc = {
    numPages: pages.length,
    getPage: async (number: number) => ({
      getTextContent: async () => ({
        items: pages[number - 1].map((str) => ({ str })),
      }),
    }),
  } as never;
}

beforeEach(() => {
  pagesEl.replaceChildren();
  resetSearchTexts();
  state.doc = null;
  state.pageCount = 0;
});

describe('поиск в модуле рисования PDF', () => {
  it('приводит текст к виду сравнения', () => {
    expect(normalizeSearchText('  Искомое \n Слово ')).toBe('искомое слово');
  });

  it('находит вхождения по всем страницам и начинает с первого', async () => {
    fakeDocument([['Слово', 'в', 'тексте'], ['и', 'слово', 'ещё']]);

    await searchBook('слово');

    expect(searchSession.hits).toEqual([
      { page: 1, ordinal: 0 },
      { page: 2, ordinal: 0 },
    ]);
    expect(searchSession.index).toBe(0);
    expect(searchSession.truncated).toBe(false);
  });

  it('не зависит от регистра и лишних пробелов в запросе', async () => {
    fakeDocument([['ИСКОМОЕ', 'СЛОВО']]);

    await searchBook('  искомое   слово ');

    expect(searchSession.hits).toHaveLength(1);
  });

  it('пустой запрос снимает результат', async () => {
    fakeDocument([['слово']]);
    await searchBook('слово');
    expect(searchSession.hits).toHaveLength(1);

    await searchBook('   ');

    expect(searchSession.hits).toHaveLength(0);
    expect(searchSession.index).toBeNull();
  });

  it('переходит по кругу и отмечает активное вхождение', () => {
    page(1, ['слово', 'и', 'слово']);
    searchSession.query = 'слово';
    markPage(pagesEl.children[0] as HTMLElement);
    searchSession.hits = [
      { page: 1, ordinal: 0 },
      { page: 1, ordinal: 1 },
    ];
    searchSession.index = 0;

    stepSearch(1);
    expect(searchSession.index).toBe(1);

    stepSearch(1);
    expect(searchSession.index).toBe(0);
    stepSearch(-1);
    expect(searchSession.index).toBe(1);
    expect(document.querySelectorAll(`.${SEARCH_ACTIVE_CLASS}`).length).toBe(1);
  });

  it('подсвечивает все вхождения страницы и снимает подсветку без следа', () => {
    page(1, ['слово', 'и', 'слово']);
    searchSession.query = 'слово';

    markPage(pagesEl.children[0] as HTMLElement);
    expect(document.querySelectorAll(`mark.${SEARCH_HIT_CLASS}`)).toHaveLength(2);

    clearSearchMarks();
    expect(document.querySelector(`.${SEARCH_HIT_CLASS}`)).toBeNull();
    expect(pagesEl.textContent).toBe('словоислово');
  });

  it('без вхождений переход ничего не делает', () => {
    searchSession.hits = [];
    searchSession.index = null;

    stepSearch(1);

    expect(searchSession.index).toBeNull();
    expect(document.querySelector(`.${SEARCH_ACTIVE_CLASS}`)).toBeNull();
  });
});
