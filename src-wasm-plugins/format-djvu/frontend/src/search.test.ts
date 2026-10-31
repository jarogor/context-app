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

/** Документ DjVu с текстовыми зонами страниц. */
function fakeDocument(pages: string[][]): void {
  state.pageCount = pages.length;
  state.doc = {
    page_count: () => pages.length,
    page: (index: number) => ({
      text_zones_json: () =>
        JSON.stringify(
          pages[index].map((t, i) => ({ t, x: 0, y: i, w: 100, h: 10 })),
        ),
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
  it('приводит текст к виду сравнения', () => {
    expect(normalizeSearchText('  Искомое \n Слово ')).toBe('искомое слово');
    expect(pageTextOf(['Искомое', ' ', 'слово'])).toBe('искомое слово');
  });

  it('находит фразу по зонам соседних слов', () => {
    fakeDocument([['Искомое', 'слово', 'в', 'тексте']]);

    searchBook('искомое слово');

    expect(searchSession.hits).toEqual([{ page: 1, ordinal: 0 }]);
    expect(searchSession.index).toBe(0);
  });

  it('считает вхождения по страницам и переходит по кругу', () => {
    fakeDocument([
      ['слово', 'и', 'слово'],
      ['слово'],
    ]);

    searchBook('слово');

    expect(searchSession.hits).toEqual([
      { page: 1, ordinal: 0 },
      { page: 1, ordinal: 1 },
      { page: 2, ordinal: 0 },
    ]);
    searchSession.index = 0;
    stepSearch(1);
    expect(searchSession.index).toBe(1);
    stepSearch(-1);
    expect(searchSession.index).toBe(0);
  });

  it('пустой запрос снимает результат', () => {
    fakeDocument([['слово']]);
    searchBook('слово');
    expect(searchSession.hits).toHaveLength(1);

    searchBook('   ');

    expect(searchSession.hits).toHaveLength(0);
    expect(searchSession.index).toBeNull();
  });

  it('подсвечивает все вхождения страницы и снимает подсветку без следа', () => {
    page(1, ['слово', 'и', 'слово']);
    searchSession.query = 'слово';

    markPage(pagesEl.children[0] as HTMLElement);
    const marks = document.querySelectorAll(`mark.${SEARCH_HIT_CLASS}`);
    expect(marks).toHaveLength(2);
    expect(Array.from(marks).map((mark) => (mark as HTMLElement).dataset.ordinal)).toEqual([
      '0',
      '1',
    ]);

    clearSearchMarks();
    expect(document.querySelector(`.${SEARCH_HIT_CLASS}`)).toBeNull();
    expect(pagesEl.textContent).toBe('словоислово');
  });

  it('подсвечивает вхождение и отмечает активное', () => {
    page(1, ['слово', 'и', 'слово']);
    searchSession.query = 'слово';
    searchSession.hits = [
      { page: 1, ordinal: 0 },
      { page: 1, ordinal: 1 },
    ];
    searchSession.index = 0;
    markPage(pagesEl.children[0] as HTMLElement);

    stepSearch(1);

    expect(searchSession.index).toBe(1);
    expect(document.querySelectorAll(`.${SEARCH_ACTIVE_CLASS}`).length).toBe(1);
    expect(
      (document.querySelector(`.${SEARCH_ACTIVE_CLASS}`) as HTMLElement).dataset.ordinal,
    ).toBe('1');
  });

  it('после поиска показывает первое вхождение', async () => {
    const pageEl = page(1, ['слово', 'и', 'слово']);
    fakeDocument([['слово', 'и', 'слово']]);

    await searchBook('слово');

    expect(searchSession.index).toBe(0);
    // Первое вхождение отмечается активным: поиск находит места, и место
    // сразу видно, а не остаётся невидимым до первого перехода.
    const active = pageEl.querySelector(`.${SEARCH_ACTIVE_CLASS}`);
    expect(active?.textContent).toBe('слово');
  });

  it('без вхождений переход ничего не делает', () => {
    searchSession.hits = [];
    searchSession.index = null;

    stepSearch(1);

    expect(searchSession.index).toBeNull();
    expect(document.querySelector(`.${SEARCH_ACTIVE_CLASS}`)).toBeNull();
  });
});
