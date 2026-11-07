import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import BookPage from './BookPage.svelte';
import type { BookPropertyEntry } from './book-properties';
import type { Book, BookFormatInfo } from './library';

/** Книга с заполненными свойствами. */
function book(overrides: Partial<Book> = {}): Book {
  return {
    id: 'a',
    title: 'Книга',
    authors: [{ name: 'Автор' }],
    tags: [{ name: 'тег' }],
    files: [{ kind: 'book', path: 'a.epub', format: 'epub' }],
    language: 'ru',
    published: '2019-05-01T00:00:00+00:00',
    publisher: 'Издатель',
    description: 'Описание книги',
    identifier: 'urn:isbn:978-5-00000-000-0',
    size: 2048,
    addedAtMillis: Date.UTC(2024, 0, 2, 3, 4),
    ...overrides,
  };
}

/** Форматы файлов книги для страницы. */
const FORMATS: BookFormatInfo[] = [{ format: 'epub', readable: true }];

/** Пропсы страницы книги. */
function pageProps(overrides: Record<string, unknown> = {}) {
  return {
    book: book(),
    path: '/lib/a.epub',
    userEntry: {} as BookPropertyEntry,
    formats: FORMATS,
    canRead: true,
    openingFormat: null,
    openError: null,
    onClose: vi.fn(),
    onOpenFolder: vi.fn(),
    onSaveProperties: vi.fn(),
    onResetProperties: vi.fn(),
    onAdd: vi.fn(),
    onOpen: vi.fn(),
    onFilterBy: vi.fn(),
    ...overrides,
  };
}

describe('страница книги', () => {
  it('показывает сведения без раскрытия разделов', () => {
    render(BookPage, { props: pageProps() });

    expect(screen.getByTestId('book-title').textContent).toContain('Книга');
    expect(screen.getByTestId('book-author-link').textContent).toContain('Автор');
    expect(screen.getByTestId('book-format-link-epub')).toBeTruthy();
    expect(screen.getByTestId('book-tags').textContent).toContain('тег');
    expect(screen.getByTestId('book-property-published').textContent).toContain('2019-05-01');
    expect(screen.getByTestId('book-property-language').textContent).toContain('ru');
    expect(screen.getByTestId('book-property-publisher').textContent).toContain('Издатель');
    expect(screen.getByTestId('book-property-identifier').textContent).toContain('urn:isbn');
    expect(screen.getByTestId('book-description').textContent).toContain('Описание книги');
  });

  it('держит технические сведения о файле внизу', () => {
    render(BookPage, { props: pageProps() });

    const file = screen.getByTestId('book-file');
    expect(file.textContent).toContain('/lib/a.epub');
    expect(file.textContent).toContain('2 КБ');
    expect(file.textContent).toContain('2024');
  });

  it('не показывает пустых сведений', () => {
    render(BookPage, {
      props: pageProps({
        book: book({
          tags: [],
          language: undefined,
          published: undefined,
          publisher: undefined,
          identifier: undefined,
          description: undefined,
          size: undefined,
        }),
      }),
    });

    expect(screen.queryByTestId('book-tags')).toBeNull();
    expect(screen.queryByTestId('book-property-published')).toBeNull();
    expect(screen.queryByTestId('book-property-language')).toBeNull();
    expect(screen.queryByTestId('book-property-publisher')).toBeNull();
    expect(screen.queryByTestId('book-property-identifier')).toBeNull();
    expect(screen.queryByTestId('book-description')).toBeNull();
    expect(screen.queryByTestId('book-property-size')).toBeNull();
  });

  it('ведёт к списку книг по автору, формату, языку и тегу', async () => {
    const onFilterBy = vi.fn();
    render(BookPage, { props: pageProps({ onFilterBy }) });

    await fireEvent.click(screen.getByTestId('book-author-link'));
    await fireEvent.click(screen.getByTestId('book-format-link-epub'));
    await fireEvent.click(screen.getByTestId('book-property-language'));
    await fireEvent.click(screen.getByRole('button', { name: 'тег' }));

    expect(onFilterBy).toHaveBeenNthCalledWith(1, 'author', 'Автор');
    expect(onFilterBy).toHaveBeenNthCalledWith(2, 'format', 'epub');
    expect(onFilterBy).toHaveBeenNthCalledWith(3, 'language', 'ru');
    expect(onFilterBy).toHaveBeenNthCalledWith(4, 'tag', 'тег');
  });

  it('правит сведения одним действием на странице', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });

    await fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    await fireEvent.input(screen.getByLabelText('Название'), {
      target: { value: 'Новое название' },
    });
    await fireEvent.click(screen.getByTestId('book-edit-save'));

    expect(onSaveProperties).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Новое название', authors: ['Автор'], tags: ['тег'] }),
    );
  });

  it('возвращает значения файла', async () => {
    const onResetProperties = vi.fn();
    render(BookPage, { props: pageProps({ onResetProperties }) });

    await fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    await fireEvent.click(screen.getByTestId('book-edit-reset'));

    expect(onResetProperties).toHaveBeenCalledTimes(1);
  });
});
