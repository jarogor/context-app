import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import BookPage from './BookPage.svelte';
import type { BookFormatInfo, BookWithCover } from './library';

/** Книга со всеми свойствами источника. */
function book(overrides: Partial<BookWithCover> = {}): BookWithCover {
  return {
    id: 'a',
    title: 'Книга',
    authors: [{ name: 'Автор' }],
    series: [{ series: { name: 'Серия' } }],
    tags: [{ name: 'тег' }],
    files: [{ kind: 'book', path: 'a.epub', format: 'epub' }],
    language: 'ru',
    published: '2019-05-01T00:00:00+00:00',
    publisher: 'Издатель',
    description: 'Описание книги',
    identifier: 'urn:isbn:978-5-00000-000-0',
    size: 2048,
    addedAtMillis: 1000,
    ...overrides,
  };
}

/** Форматы файлов книги для страницы. */
const FORMATS: BookFormatInfo[] = [{ format: 'epub', readable: true }];

describe('страница книги', () => {
  it('показывает свойства книги, извлечённые источником', () => {
    render(BookPage, {
      props: {
        book: book(),
        path: '/lib/a.epub',
        formats: FORMATS,
        canRead: true,
        openingFormat: null,
        openError: null,
        onClose: vi.fn(),
        onOpenFolder: vi.fn(),
        onAdd: vi.fn(),
        onOpen: vi.fn(),
      },
    });

    expect(screen.getByTestId('book-property-authors').textContent).toContain('Автор');
    expect(screen.getByTestId('book-property-format').textContent).toContain('EPUB');
    expect(screen.getByTestId('book-property-series').textContent).toContain('Серия');
    expect(screen.getByTestId('book-property-tags').textContent).toContain('тег');
    expect(screen.getByTestId('book-property-size').textContent).toContain('2 КБ');
    expect(screen.getByTestId('book-property-path').textContent).toContain('/lib/a.epub');
    // У полной даты ISO в карточке остаётся только день издания.
    expect(screen.getByTestId('book-property-published').textContent).toContain('2019-05-01');
    expect(screen.getByTestId('book-property-language').textContent).toContain('ru');
    expect(screen.getByTestId('book-property-publisher').textContent).toContain('Издатель');
    expect(screen.getByTestId('book-property-identifier').textContent).toContain('urn:isbn');
    expect(screen.getByTestId('book-description').textContent).toContain('Описание книги');
  });

  it('незаполненные свойства читаются как «не указано»', () => {
    render(BookPage, {
      props: {
        book: book({
          series: [],
          tags: [],
          language: undefined,
          published: undefined,
          publisher: undefined,
          identifier: undefined,
          description: undefined,
          size: undefined,
        }),
        path: '',
        formats: FORMATS,
        canRead: true,
        openingFormat: null,
        openError: null,
        onClose: vi.fn(),
        onOpenFolder: vi.fn(),
        onAdd: vi.fn(),
        onOpen: vi.fn(),
      },
    });

    for (const id of [
      'series',
      'tags',
      'language',
      'published',
      'publisher',
      'identifier',
      'size',
    ]) {
      expect(screen.getByTestId(`book-property-${id}`).textContent).toContain('Не указано');
    }
    // Описания нет — и блока нет, а не пустая рамка.
    expect(screen.queryByTestId('book-description')).toBeNull();
  });

  it('открывает папку с файлом книги', async () => {
    const onOpenFolder = vi.fn();
    render(BookPage, {
      props: {
        book: book(),
        path: '/lib/a.epub',
        formats: FORMATS,
        canRead: true,
        openingFormat: null,
        openError: null,
        onClose: vi.fn(),
        onOpenFolder,
        onAdd: vi.fn(),
        onOpen: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByTestId('book-open-folder'));

    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });
});
