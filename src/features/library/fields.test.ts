import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  bookFacets,
  emptyFilters,
  filterBooks,
  sortBooks,
  toggleFacet,
  type BookFilters,
} from './fields';
import type { Book } from './library';

/** Книга с заданными свойствами. */
function book(overrides: Partial<Book> & { id: string }): Book {
  return {
    title: overrides.id,
    authors: [],
    tags: [],
    files: [{ kind: 'book', path: `${overrides.id}.epub`, format: 'epub' }],
    ...overrides,
  };
}

/** Названия книг в порядке списка. */
function titles(books: Book[]): string[] {
  return books.map((item) => item.title);
}

describe('сортировка книг', () => {
  const catalog = [
    book({
      id: 'b',
      title: 'Б',
      authors: [{ name: 'Борис' }],
      size: 300,
      published: '2019-01-01',
      addedAtMillis: 200,
    }),
    book({
      id: 'a',
      title: 'А',
      authors: [{ name: 'Антон' }],
      size: 100,
      published: '2021-01-01',
      addedAtMillis: 100,
    }),
    book({ id: 'v', title: 'В' }),
  ];

  it('сортирует по названию в обе стороны', () => {
    expect(titles(sortBooks(catalog, 'title', 'asc', 'ru'))).toEqual(['А', 'Б', 'В']);
    expect(titles(sortBooks(catalog, 'title', 'desc', 'ru'))).toEqual(['В', 'Б', 'А']);
  });

  it('сортирует по автору, уводя книги без автора в конец в любом направлении', () => {
    expect(titles(sortBooks(catalog, 'author', 'asc', 'ru'))).toEqual(['А', 'Б', 'В']);
    expect(titles(sortBooks(catalog, 'author', 'desc', 'ru'))).toEqual(['Б', 'А', 'В']);
  });

  it('сортирует числовые свойства как числа', () => {
    expect(titles(sortBooks(catalog, 'size', 'asc', 'ru'))).toEqual(['А', 'Б', 'В']);
    expect(titles(sortBooks(catalog, 'size', 'desc', 'ru'))).toEqual(['Б', 'А', 'В']);
  });

  it('сортирует даты и сохраняет порядок при равенстве', () => {
    expect(titles(sortBooks(catalog, 'published', 'asc', 'ru'))).toEqual(['Б', 'А', 'В']);
    expect(titles(sortBooks(catalog, 'added', 'desc', 'ru'))).toEqual(['Б', 'А', 'В']);
    const same = [book({ id: 'one', title: 'Одна' }), book({ id: 'two', title: 'Две' })];
    // При равных значениях порядок задаёт название — список не «перетасовывается».
    expect(titles(sortBooks(same, 'size', 'asc', 'ru'))).toEqual(['Две', 'Одна']);
  });
});

describe('фильтры книг', () => {
  const catalog = [
    book({
      id: 'one',
      title: 'Книга 1',
      authors: [{ name: 'Антон' }],
      language: 'ru',
      tags: [{ name: 'история' }],
    }),
    book({
      id: 'two',
      title: 'Книга 2',
      authors: [{ name: 'Борис' }],
      language: 'en',
      files: [{ kind: 'book', path: 'two.fb2', format: 'fb2' }],
    }),
    book({
      id: 'three',
      title: 'Книга 3',
      authors: [{ name: 'Антон' }],
      language: 'ru',
      files: [{ kind: 'book', path: 'three.pdf', format: 'pdf' }],
    }),
  ];

  /** Фильтры из одного фасета. */
  function withFacet(id: keyof BookFilters, values: string[]): BookFilters {
    return { ...emptyFilters(), [id]: values };
  }

  it('без фильтров показывает все книги', () => {
    expect(titles(filterBooks(catalog, emptyFilters()))).toHaveLength(3);
  });

  it('внутри фасета складывает значения «или»', () => {
    const result = filterBooks(catalog, withFacet('authors', ['Антон', 'Борис']));

    expect(titles(result)).toEqual(['Книга 1', 'Книга 2', 'Книга 3']);
  });

  it('между фасетами действует «и»', () => {
    const filters: BookFilters = {
      ...emptyFilters(),
      authors: ['Антон'],
      formats: ['pdf'],
    };

    // Книга 3 подходит по обоим фасетам, книги 1 и 2 — только по одному.
    expect(titles(filterBooks(catalog, filters))).toEqual(['Книга 3']);
  });

  it('флажок «без обложки» оставляет только книги без неё', () => {
    const catalogWithCovers = [
      book({ id: 'with', title: 'С обложкой', hasCover: true }),
      book({ id: 'without', title: 'Без обложки', hasCover: false }),
    ];

    expect(
      titles(filterBooks(catalogWithCovers, { ...emptyFilters(), withoutCover: true })),
    ).toEqual(['Без обложки']);
  });

  it('считает активные фасеты и переключает значения', () => {
    const filters = toggleFacet(emptyFilters(), 'formats', 'epub');

    expect(filters.formats).toEqual(['epub']);
    expect(activeFilterCount(filters)).toBe(1);
    expect(toggleFacet(filters, 'formats', 'epub').formats).toEqual([]);
    expect(activeFilterCount({ ...filters, withoutCover: true })).toBe(2);
  });

  it('собирает значения фасетов с числом книг', () => {
    const facets = bookFacets(catalog, 'ru');

    expect(facets.formats).toEqual([
      { value: 'epub', label: 'EPUB', count: 1 },
      { value: 'fb2', label: 'FB2', count: 1 },
      { value: 'pdf', label: 'PDF', count: 1 },
    ]);
    expect(facets.authors).toEqual([
      { value: 'Антон', label: 'Антон', count: 2 },
      { value: 'Борис', label: 'Борис', count: 1 },
    ]);
    expect(facets.languages.map((item) => item.value)).toEqual(['en', 'ru']);
    expect(facets.tags).toEqual([{ value: 'история', label: 'история', count: 1 }]);
  });
});
