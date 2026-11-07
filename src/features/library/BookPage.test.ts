import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import BookPage from './BookPage.svelte';
import type { BookPropertyEntry } from './book-properties';
import type { BookFormatInfo, BookWithCover } from './library';

/** Книга с заполненными свойствами. */
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
    ...overrides,
  };
}

describe('страница книги', () => {
  it('показывает заполненные свойства, когда раздел раскрыт', async () => {
    render(BookPage, { props: pageProps() });

    // Разделы закрыты, пока их не раскроет пользователь.
    expect(screen.queryByTestId('book-property-authors')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Основное' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Издание' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Файл' }));

    expect(screen.getByTestId('book-property-authors').textContent).toContain('Автор');
    expect(screen.getByTestId('book-property-format').textContent).toContain('EPUB');
    expect(screen.getByTestId('book-property-series').textContent).toContain('Серия');
    expect(screen.getByTestId('book-property-published').textContent).toContain('2019-05-01');
    expect(screen.getByTestId('book-property-language').textContent).toContain('ru');
    expect(screen.getByTestId('book-property-publisher').textContent).toContain('Издатель');
    expect(screen.getByTestId('book-property-identifier').textContent).toContain('urn:isbn');
    expect(screen.getByTestId('book-property-size').textContent).toContain('2 КБ');
    expect(screen.getByTestId('book-property-path').textContent).toContain('/lib/a.epub');
    // Дата добавления файла подписана явно, чтобы её не путали с датой выхода.
    expect(screen.getByTestId('book-property-added').textContent).toContain('2024');
  });

  it('не показывает пустых свойств и пустых разделов', async () => {
    render(BookPage, {
      props: pageProps({
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
      }),
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Основное' }));

    expect(screen.queryByTestId('book-property-series')).toBeNull();
    expect(screen.queryByTestId('book-section-edition')).toBeNull();
    expect(screen.queryByTestId('book-section-tags')).toBeNull();
    expect(screen.queryByTestId('book-section-description')).toBeNull();
    expect(screen.queryByTestId('book-property-size')).toBeNull();
  });

  it('описание показывается по раскрытию раздела', async () => {
    render(BookPage, { props: pageProps() });

    expect(screen.queryByTestId('book-description')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Описание' }));

    expect(screen.getByTestId('book-description').textContent).toContain('Описание книги');
  });

  it('правит только поля своей группы', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });

    const tags = screen.getByTestId('book-section-tags');
    await fireEvent.click(within(tags).getByRole('button', { name: 'Изменить' }));
    await fireEvent.input(screen.getByLabelText('Теги (через запятую)'), {
      target: { value: 'мой тег, ещё' },
    });
    await fireEvent.click(screen.getByTestId('book-edit-save'));

    // Остальные свойства книги правка не трогает.
    expect(onSaveProperties).toHaveBeenCalledWith({ tags: ['мой тег', 'ещё'] });
  });

  it('возвращает значения файла', async () => {
    const onResetProperties = vi.fn();
    render(BookPage, {
      props: pageProps({
        userEntry: { title: 'Моё название' } as BookPropertyEntry,
        onResetProperties,
      }),
    });

    const main = screen.getByTestId('book-section-main');
    await fireEvent.click(within(main).getByRole('button', { name: 'Изменить' }));
    await fireEvent.click(screen.getByTestId('book-edit-reset'));

    expect(onResetProperties).toHaveBeenCalledTimes(1);
  });
});
