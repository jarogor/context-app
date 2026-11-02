import { describe, expect, it } from 'vitest';

import {
  emptyProperties,
  mergeFileAnnotations,
  normalizeBookmarks,
  parseFileAnnotationBatch,
  propertyTabs,
  type FileAnnotation,
} from './file-properties';

/** Встроенная пометка для проверки слияния. */
function annotation(id: string): FileAnnotation {
  return {
    id,
    kind: 'highlight',
    page: 1,
    rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.02 }],
    quote: 'текст',
    comment: '',
    author: '',
    color: '',
    modified: '',
  };
}

describe('дерево встроенных закладок', () => {
  it('сохраняет вложенность и отбрасывает пустые узлы', () => {
    const bookmarks = normalizeBookmarks([
      {
        title: 'Часть',
        page: 1,
        children: [
          { title: 'Глава', page: 3 },
          { title: '', page: null, children: [] },
        ],
      },
      { title: '', page: null },
    ]);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].children.map((child) => child.title)).toEqual(['Глава']);
  });

  it('не делает страницей нулевой или нечисловой номер', () => {
    const [bookmark] = normalizeBookmarks([{ title: 'Раздел', page: 0 }]);
    expect(bookmark.page).toBeNull();
    const [broken] = normalizeBookmarks([{ title: 'Раздел', page: 'нет' }]);
    expect(broken.page).toBeNull();
  });

  it('принимает страницу строкой числа', () => {
    const [bookmark] = normalizeBookmarks([{ title: 'Раздел', page: '12' }]);
    expect(bookmark.page).toBe(12);
  });
});

describe('встроенные пометки файла', () => {
  it('отбрасывает пометку без идентификатора, неизвестного вида и без страницы', () => {
    expect(
      parseFileAnnotationBatch({
        annotations: [
          { id: '', kind: 'highlight', page: 1 },
          { id: 'a', kind: 'ink', page: 1 },
          { id: 'b', kind: 'highlight', page: 0 },
          { id: 'c', kind: 'highlight', page: 2 },
        ],
      }).annotations.map((item) => item.id),
    ).toEqual(['c']);
  });

  it('ограничивает прямоугольники страницей и отбрасывает пустые', () => {
    const batch = parseFileAnnotationBatch({
      annotations: [
        {
          id: 'a',
          kind: 'underline',
          page: 1,
          rects: [
            { x: -0.5, y: 0.5, width: 0.2, height: 0.1 },
            { x: 0, y: 0, width: 0, height: 0.1 },
          ],
        },
      ],
    });
    const [rect, ...rest] = batch.annotations[0].rects;
    expect(rect).toEqual({ x: 0, y: 0.5, width: 0.2, height: 0.1 });
    expect(rest).toHaveLength(0);
  });

  it('сливает порции без повторов и сбрасывает по признаку reset', () => {
    const first = mergeFileAnnotations([], {
      reset: true,
      done: false,
      annotations: [annotation('a')],
      processed: 1,
      total: 3,
      error: '',
    });
    const second = mergeFileAnnotations(first, {
      reset: false,
      done: false,
      annotations: [annotation('a'), annotation('b')],
      processed: 2,
      total: 3,
      error: '',
    });
    expect(second.map((item) => item.id)).toEqual(['a', 'b']);
    const reset = mergeFileAnnotations(second, {
      reset: true,
      done: true,
      annotations: [annotation('c')],
      processed: 3,
      total: 3,
      error: '',
    });
    expect(reset.map((item) => item.id)).toEqual(['c']);
  });
});

describe('вкладки панели свойств', () => {
  it('показывает содержание только у текучей книги', () => {
    const flowing = {
      ...emptyProperties('epub'),
      flowing: true,
      chapters: [{ index: 0, title: 'Глава' }],
    };
    expect(propertyTabs(flowing)).toEqual(['contents']);
  });

  it('не показывает превью и пометки без поддержки формата', () => {
    const paged = { ...emptyProperties('pdf'), pageCount: 10 };
    expect(propertyTabs(paged)).toEqual([]);
    const supported = {
      ...paged,
      thumbnails: true,
      annotationsSupported: true,
      bookmarksSupported: true,
    };
    expect(propertyTabs(supported)).toEqual(['bookmarks', 'pages', 'annotations']);
  });

  it('не показывает страницы при нулевом числе страниц', () => {
    const paged = {
      ...emptyProperties('pdf'),
      bookmarksSupported: true,
      thumbnails: true,
      pageCount: 0,
    };
    expect(propertyTabs(paged)).toEqual(['bookmarks']);
  });
});
