import { beforeEach, describe, expect, it } from 'vitest';

import { pagesEl, TEXT_LAYER_CLASS } from './dom';
import {
  clearSearchMarks,
  markPage,
  normalizeSearchText,
  resetSearchTexts,
  SEARCH_ACTIVE_CLASS,
  SEARCH_HIT_CLASS,
  SEARCH_LAYER_CLASS,
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
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  pageEl.append(layer, overlay);
  pagesEl.append(pageEl);
  // jsdom не считает геометрию: строка текста объявляется измеряемой, иначе
  // подсветке нечего ставить на страницу.
  (layer.firstElementChild as HTMLElement).getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 40, height: 16, top: 0, left: 0, right: 40, bottom: 16 }) as DOMRect;
  pageEl.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 400, height: 600, top: 0, left: 0, right: 400, bottom: 600 }) as DOMRect;
  Range.prototype.getClientRects = () =>
    [{ x: 0, y: 0, width: 40, height: 16, top: 0, left: 0, right: 40, bottom: 16 } as DOMRect] as unknown as DOMRectList;
  pageEl.scrollIntoView = () => undefined;
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

/** Страницы, текст которых запрашивался у документа, в порядке запроса. */
let fetched: number[] = [];

/** Документ, запоминающий порядок разбора страниц. */
function trackedDocument(pages: string[][]): void {
  state.pageCount = pages.length;
  state.doc = {
    numPages: pages.length,
    getPage: async (number: number) => {
      fetched.push(number);
      return {
        getTextContent: async () => ({
          items: pages[number - 1].map((str) => ({ str })),
        }),
      };
    },
  } as never;
}

/** Сообщения поиска, отправленные приложению, с числом разобранных страниц. */
async function runAndCollect(query: string): Promise<Array<{ total: number; index: number | null; fetched: number }>> {
  const reported: Array<{ total: number; index: number | null; fetched: number }> = [];
  const listener = (event: MessageEvent) => {
    const data = event.data as { type?: string; value?: { total?: number; index?: number | null } };
    if (data?.type === 'search') {
      reported.push({
        total: Number(data.value?.total ?? 0),
        index: data.value?.index ?? null,
        fetched: fetched.length,
      });
    }
  };
  window.addEventListener('message', listener);
  try {
    await searchBook(query);
  } finally {
    window.removeEventListener('message', listener);
  }
  return reported;
}

beforeEach(() => {
  pagesEl.replaceChildren();
  resetSearchTexts();
  state.doc = null;
  state.pageCount = 0;
  state.currentPage = 1;
  fetched = [];
});

describe('поиск в модуле рисования PDF', () => {
  it('ищет от текущей страницы, сообщает найденное до конца разбора и переходит', async () => {
    // Читатель стоит на 20-й странице, где слово и есть. Разбор обязан начаться
    // с неё: иначе первое найденное приходит только после разбора всей книги.
    const pages = Array.from({ length: 60 }, (_, index) =>
      index === 19 ? ['искомое'] : ['прочее'],
    );
    trackedDocument(pages);
    state.currentPage = 20;

    const reported = await runAndCollect('искомое');

    expect(fetched[0]).toBe(20);
    expect(fetched.indexOf(1)).toBeGreaterThan(pages.length - 20);
    expect(searchSession.hits).toEqual([{ page: 20, ordinal: 0 }]);
    expect(searchSession.index).toBe(0);
    // Найденное сообщено приложению до конца разбора книги.
    const firstFound = reported.find((item) => item.total > 0 && item.index === 0);
    expect(firstFound).toBeDefined();
    expect(firstFound!.fetched).toBeLessThan(pages.length);
  });

  it('ищет по всем страницам, не зависит от регистра и пробелов, отдаёт порядок книги', async () => {
    fakeDocument([
      ['Слово', 'на', 'первой'],
      ['и', 'СЛОВО', 'на', 'второй'],
      ['слово', 'на', 'третьей'],
    ]);
    state.currentPage = 3;

    // Регистр и лишние пробелы в запросе не важны; страницы — в порядке книги,
    // хотя разбор начат с текущей.
    expect(searchSession.hits).toHaveLength(0);
    await runAndCollect('  слово ');
    expect(searchSession.hits.map((hit) => hit.page)).toEqual([1, 2, 3]);
    expect(searchSession.index).toBe(0);

    // Пустой запрос снимает результат.
    await runAndCollect('   ');
    expect(searchSession.hits).toHaveLength(0);
    expect(searchSession.index).toBeNull();
  });

  it('подсвечивает найденное слоем над растром и переходит по кругу', () => {
    const pageEl = page(1, ['слово', 'и', 'слово']);
    searchSession.query = 'слово';
    markPage(pageEl);
    searchSession.hits = [
      { page: 1, ordinal: 0 },
      { page: 1, ordinal: 1 },
    ];
    searchSession.index = 0;

    // Подсветка — отдельный слой над растром, а не разметка в прозрачном
    // текстовом слое: иначе заливка ложилась плёнкой поверх букв и мутила текст.
    expect(pageEl.querySelector(`.${SEARCH_LAYER_CLASS}`)).toBeTruthy();
    expect(pageEl.querySelector(`.${TEXT_LAYER_CLASS} mark`)).toBeNull();
    expect(pageEl.querySelectorAll(`.${SEARCH_HIT_CLASS}`).length).toBeGreaterThan(0);

    stepSearch(1);
    expect(searchSession.index).toBe(1);
    expect(pageEl.querySelectorAll(`.${SEARCH_ACTIVE_CLASS}`)).toHaveLength(1);

    stepSearch(1);
    expect(searchSession.index).toBe(0);
    stepSearch(-1);
    expect(searchSession.index).toBe(1);

    // Снятие подсветки убирает слой и не трогает текст страницы.
    clearSearchMarks();
    expect(document.querySelector(`.${SEARCH_LAYER_CLASS}`)).toBeNull();
    expect(pagesEl.textContent).toBe('словоислово');

    // Без вхождений переход ничего не делает.
    searchSession.hits = [];
    searchSession.index = null;
    stepSearch(1);
    expect(searchSession.index).toBeNull();
    expect(normalizeSearchText(' Искомое \n Слово ')).toBe('искомое слово');
  });
});
