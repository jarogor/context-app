import { describe, expect, it } from 'vitest';

import { readBookmarks } from './bookmarks';

/** Документ pdf.js с заданным оглавлением и страницами. */
function documentWith(outline: unknown, pageIndex: (ref: unknown) => number) {
  return {
    getOutline: async () => outline,
    getDestination: async (name: string) => (name === 'named' ? [3, { num: 1, gen: 0 }] : null),
    getPageIndex: async (ref: unknown) => pageIndex(ref),
  } as never;
}

describe('оглавление PDF', () => {
  it('переводит явные цели и вложенность в закладки', async () => {
    const doc = documentWith(
      [
        {
          title: ' Часть ',
          dest: [0, { num: 0, gen: 0 }],
          items: [
            { title: 'Глава 1', dest: [{ num: 4, gen: 0 }] },
            { title: 'Глава 2', dest: [7] },
          ],
        },
        { title: 'Приложение', dest: null, items: [] },
      ],
      () => 4,
    );
    const bookmarks = await readBookmarks(doc);
    expect(bookmarks[0].title).toBe('Часть');
    expect(bookmarks[0].page).toBe(1);
    expect(bookmarks[0].children.map((item) => item.page)).toEqual([5, 8]);
    // Узел без цели остаётся заголовком, а не пропадает.
    expect(bookmarks[1]).toEqual({ title: 'Приложение', page: null, children: [] });
  });

  it('разрешает именованную цель через документ', async () => {
    const doc = documentWith([{ title: 'Раздел', dest: 'named' }], () => 1);
    const bookmarks = await readBookmarks(doc);
    expect(bookmarks[0].page).toBe(4);
  });

  it('не падает без оглавления и при ошибке чтения', async () => {
    expect(await readBookmarks(documentWith(null, () => 0))).toEqual([]);
    const broken = {
      getOutline: async () => {
        throw new Error('нет оглавления');
      },
    } as never;
    expect(await readBookmarks(broken)).toEqual([]);
  });

  it('не срывается на узле с неразрешимой целью', async () => {
    const doc = {
      getOutline: async () => [
        { title: 'Внешняя', dest: null, url: 'https://example.org' },
        { title: 'Битая', dest: [{}], items: [] },
      ],
      getDestination: async () => null,
      getPageIndex: async () => {
        throw new Error('нет страницы');
      },
    } as never;
    const bookmarks = await readBookmarks(doc);
    expect(bookmarks.map((item) => [item.title, item.page])).toEqual([
      ['Внешняя', null],
      ['Битая', null],
    ]);
  });
});
