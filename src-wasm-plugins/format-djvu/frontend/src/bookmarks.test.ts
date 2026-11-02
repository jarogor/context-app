import { describe, expect, it } from 'vitest';

import { pageFromUrl, parseNavm, readBookmarksFromBytes } from './bookmarks';
import { resolveBookmarkNames } from './bookmark-names';
import type { ViewerBookmark } from './types';

/** Байты строки в UTF-8. */
function bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Запись строки оглавления: длина `u24` и байты. */
function navmString(text: string): number[] {
  const data = bytes(text);
  return [(data.length >> 16) & 0xff, (data.length >> 8) & 0xff, data.length & 0xff, ...data];
}

/** Запись узла оглавления без детей. */
function navmNode(title: string, url: string): number[] {
  return [0, ...navmString(title), ...navmString(url)];
}

describe('разбор оглавления DjVu', () => {
  it('читает названия и ссылки с номерами страниц', () => {
    const data = new Uint8Array([0, 2, ...navmNode('Первая', '#1'), ...navmNode('Вторая', '#page=12')]);
    const bookmarks = parseNavm(data);
    expect(bookmarks.map((item) => [item.title, item.page])).toEqual([
      ['Первая', 1],
      ['Вторая', 12],
    ]);
  });

  it('восстанавливает вложенность по числу детей', () => {
    // Корень с двумя детьми: числа детей в прямом порядке узлов.
    const child = navmNode('Глава', '#3');
    const root = [2, ...navmString('Часть'), ...navmString('#1'), ...child, ...navmNode('Ещё', '#4')];
    const data = new Uint8Array([0, 3, ...root]);
    const bookmarks = parseNavm(data);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].title).toBe('Часть');
    expect(bookmarks[0].children.map((item) => item.title)).toEqual(['Глава', 'Ещё']);
  });

  it('не падает на обрезанном потоке и пустом оглавлении', () => {
    expect(parseNavm(new Uint8Array([0, 0]))).toEqual([]);
    expect(parseNavm(new Uint8Array([0, 5, 0, 0]))).toEqual([]);
    expect(parseNavm(new Uint8Array([]))).toEqual([]);
  });

  it('не уходит в бесконечность при числе детей больше узлов', () => {
    const data = new Uint8Array([0, 1, 200, ...navmString('Корень'), ...navmString('#1')]);
    const bookmarks = parseNavm(data);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].children).toEqual([]);
  });

  it('ограничивает разбор объявленным числом узлов', () => {
    // Объявлен один узел, а в потоке их два: второй не разбирается.
    const data = new Uint8Array([0, 1, ...navmNode('Первый', '#1'), ...navmNode('Второй', '#2')]);
    expect(parseNavm(data).map((item) => item.title)).toEqual(['Первый']);
  });

  it('не находит оглавление в файле без чанка NAVM', () => {
    const bytes = new TextEncoder().encode('AT&TFORM\0\0\0\0DJVUINFO');
    expect(readBookmarksFromBytes(bytes)).toEqual([]);
  });

  it('распознаёт ссылку на имя файла страницы составной книги', () => {
    expect(pageFromUrl('#p0002.djvu')).toEqual({ page: null, name: 'p0002.djvu' });
    expect(pageFromUrl('#page=7')).toEqual({ page: 7, name: null });
    expect(pageFromUrl('')).toEqual({ page: null, name: null });
  });
});

describe('разрешение имён страниц составного DjVu', () => {
  it('ставит номер страницы по месту имени в каталоге', () => {
    const bookmarks: ViewerBookmark[] = [
      { title: 'Первая', page: null, name: 'p0001.djvu', children: [] },
      { title: 'Вторая', page: null, name: 'p0002.djvu', children: [] },
    ];
    const resolved = resolveBookmarkNames(bookmarks, ['p0001.djvu', 'p0002.djvu']);
    expect(resolved.map((item) => item.page)).toEqual([1, 2]);
  });

  it('не подменяет уже известный номер и не теряет вложенность', () => {
    const bookmarks: ViewerBookmark[] = [
      {
        title: 'Часть',
        page: 7,
        name: 'нет.djv',
        children: [{ title: 'Глава', page: null, name: 'p0003.djvu', children: [] }],
      },
    ];
    const resolved = resolveBookmarkNames(bookmarks, ['p0001.djvu', 'p0002.djvu', 'p0003.djvu']);
    expect(resolved[0].page).toBe(7);
    expect(resolved[0].children[0].page).toBe(3);
  });
});
