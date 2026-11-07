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
    authors: [{ name: 'Автор' }, { name: 'Соавтор' }],
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
  it('показывает сведения книги и файла', () => {
    render(BookPage, { props: pageProps() });

    expect(screen.getByTestId('book-title').textContent).toContain('Книга');
    expect(screen.getByTestId('book-authors').textContent).toContain('Соавтор');
    expect(screen.getByTestId('book-formats').textContent).toContain('EPUB');
    expect(screen.getByTestId('book-tags').textContent).toContain('тег');
    expect(screen.getByTestId('book-property-published').textContent).toContain('2019-05-01');
    expect(screen.getByTestId('book-property-language').textContent).toContain('ru');
    expect(screen.getByTestId('book-property-publisher').textContent).toContain('Издатель');
    expect(screen.getByTestId('book-description').textContent).toContain('Описание книги');

    const file = screen.getByTestId('book-file');
    expect(file.textContent).toContain('/lib/a.epub');
    expect(file.textContent).toContain('2 КБ');
    expect(file.textContent).toContain('2024');
  });

  it('подписывает действия с форматом', () => {
    render(BookPage, { props: pageProps() });

    expect(screen.getByRole('button', { name: 'Читать' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Открыть файл' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Открыть папку с файлом' })).toBeTruthy();
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

    expect(screen.queryByTestId('book-properties')).toBeNull();
    expect(screen.queryByTestId('book-description')).toBeNull();
    expect(screen.queryByTestId('book-property-size')).toBeNull();
    // Теги видны всегда: их можно добавить правкой.
    expect(screen.getByTestId('book-tags').textContent).toContain('—');
  });

  it('ведёт к списку книг по автору, формату, языку и тегу', async () => {
    const onFilterBy = vi.fn();
    render(BookPage, { props: pageProps({ onFilterBy }) });

    await fireEvent.click(screen.getByRole('button', { name: /^Автор$/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'EPUB' }));
    await fireEvent.click(screen.getByRole('button', { name: 'ru' }));
    await fireEvent.click(screen.getByRole('button', { name: 'тег' }));

    expect(onFilterBy).toHaveBeenNthCalledWith(1, 'author', 'Автор');
    expect(onFilterBy).toHaveBeenNthCalledWith(2, 'format', 'epub');
    expect(onFilterBy).toHaveBeenNthCalledWith(3, 'language', 'ru');
    expect(onFilterBy).toHaveBeenNthCalledWith(4, 'tag', 'тег');
  });

  it('переключает страницу в режим редактирования и сохраняет', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });

    await fireEvent.click(screen.getByTestId('book-edit-start'));

    // В режиме правки значения полей — это поля ввода с подписями.
    await fireEvent.input(screen.getByLabelText('Название'), {
      target: { value: 'Новое название' },
    });
    await fireEvent.input(screen.getByLabelText('Авторы (через запятую)'), {
      target: { value: 'Автор, Второй' },
    });
    await fireEvent.click(screen.getByTestId('book-edit-save'));

    expect(onSaveProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Новое название',
        authors: ['Автор', 'Второй'],
        language: 'ru',
        tags: ['тег'],
      }),
    );
  });

  it('отменяет редактирование и умеет вернуть значения файла', async () => {
    const onSaveProperties = vi.fn();
    const onResetProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties, onResetProperties }) });

    await fireEvent.click(screen.getByTestId('book-edit-start'));
    await fireEvent.click(screen.getByTestId('book-edit-cancel'));

    expect(onSaveProperties).not.toHaveBeenCalled();
    expect(screen.getByTestId('book-title')).toBeTruthy();

    await fireEvent.click(screen.getByTestId('book-edit-start'));
    await fireEvent.click(screen.getByTestId('book-edit-reset'));

    expect(onResetProperties).toHaveBeenCalledTimes(1);
  });
});
