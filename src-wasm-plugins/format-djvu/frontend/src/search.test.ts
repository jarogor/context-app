import { beforeEach, describe, expect, it } from 'vitest';

import { pagesEl, TEXT_LAYER_CLASS } from './dom';
import {
  clearSearchMarks,
  markPage,
  normalizeSearchText,
  pageTextOf,
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

    // Первое найденное показано сразу, а не только после перехода: у полосы
    // в слое подсветки есть номер вхождения.
    expect(searchSession.hits).toHaveLength(2);

    stepSearch(1);
    expect(searchSession.index).toBe(1);
    stepSearch(-1);
    expect(searchSession.index).toBe(0);

    // Подсветка — отдельный слой над растром, а не разметка в прозрачном
    // текстовом слое: иначе заливка ложилась плёнкой поверх букв и мутила текст.
    searchSession.query = 'слово';
    markPage(pageEl);
    expect(pageEl.querySelector(`.${SEARCH_ACTIVE_CLASS}`)?.getAttribute('data-ordinal')).toBe(
      '0',
    );
    expect(pageEl.querySelector(`.${SEARCH_LAYER_CLASS}`)).toBeTruthy();
    expect(pageEl.querySelector(`.${TEXT_LAYER_CLASS} mark`)).toBeNull();
    expect(document.querySelectorAll(`.${SEARCH_HIT_CLASS}`).length).toBeGreaterThan(0);
    // Снятие подсветки убирает слой и не трогает текст страницы.
    clearSearchMarks();
    expect(document.querySelector(`.${SEARCH_LAYER_CLASS}`)).toBeNull();
    expect(pagesEl.textContent).toBe('словоислово');

    // Пустой запрос снимает результат; без вхождений переход ничего не делает.
    searchBook('   ');
    expect(searchSession.hits).toHaveLength(0);
    expect(searchSession.index).toBeNull();
    stepSearch(1);
    expect(searchSession.index).toBeNull();
  });
});
