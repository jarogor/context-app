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
    tags: [{ name: 'тег' }, { name: 'второй' }],
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

/** Включение режима правки переключателем в шапке. */
async function startEditing() {
  await fireEvent.click(screen.getByTestId('book-edit-toggle'));
}

describe('страница книги', () => {
  it('показывает сведения о книге', () => {
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

  it('держит файл кнопкой с подписью, а не иконкой без смысла', () => {
    render(BookPage, { props: pageProps() });

    const file = screen.getByTestId('book-file');
    expect(file.textContent).toContain('/lib/a.epub');
    expect(file.textContent).toContain('2 КБ');
    expect(file.textContent).toContain('2024');

    // Действие папки подписано: иконка «папка» сама по себе не читается кнопкой.
    const folder = screen.getByTestId('book-open-folder');
    expect(folder.textContent).toContain('Открыть папку');
  });

  it('не показывает пустых сведений в обычном режиме', () => {
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

  it('делает все форматы равноправными: у каждого своё чтение и открытие', () => {
    render(BookPage, {
      props: pageProps({
        formats: [
          { format: 'epub', readable: true },
          { format: 'pdf', readable: true },
        ],
      }),
    });

    // Ни «основного» формата, ни отдельной группы «другие файлы».
    expect(screen.queryByTestId('book-other-formats')).toBeNull();
    const epub = screen.getByTestId('book-format-epub');
    const pdf = screen.getByTestId('book-format-pdf');
    expect(epub.textContent).toContain('Читать');
    expect(pdf.textContent).toContain('Читать');
    expect(screen.getByTestId('book-read-epub')).toBeTruthy();
    expect(screen.getByTestId('book-read-pdf')).toBeTruthy();
  });

  it('даёт кнопку чтения только читаемым форматам', () => {
    render(BookPage, {
      props: pageProps({
        formats: [
          { format: 'docx', readable: false },
          { format: 'epub', readable: true },
        ],
        canRead: true,
      }),
    });

    expect(screen.queryByTestId('book-read-docx')).toBeNull();
    expect(screen.getByTestId('book-open-docx')).toBeTruthy();
    expect(screen.getByTestId('book-read-epub')).toBeTruthy();
  });

  it('показывает заглушку, пока форматы чтения грузятся', () => {
    render(BookPage, {
      props: pageProps({ formats: [], canRead: true, formatsLoading: true }),
    });

    expect(screen.getByTestId('book-formats-loading')).toBeTruthy();
    // Загрузка — не повод объявлять формат неподдерживаемым.
    expect(screen.queryByTestId('book-unsupported')).toBeNull();
  });

  it('поясняет неподдерживаемый формат', () => {
    render(BookPage, {
      props: pageProps({
        formats: [{ format: 'docx', readable: false }],
        canRead: false,
      }),
    });

    expect(screen.getByTestId('book-unsupported').textContent).toContain(
      'Формат не поддерживается',
    );
  });

  it('включает режим правки переключателем, а не отдельной формой', () => {
    render(BookPage, { props: pageProps() });

    // До включения правки полей нет: страница только читается.
    expect(screen.queryByTestId('book-edit-save')).toBeNull();

    const toggle = screen.getByTestId('book-edit-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('правит название по месту: поле открывается у самого значения', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });
    await startEditing();

    await fireEvent.click(screen.getByLabelText('Изменить: Название'));
    await fireEvent.input(screen.getByLabelText('Название'), {
      target: { value: 'Новое название' },
    });
    await fireEvent.click(screen.getByTestId('book-edit-save'));

    expect(onSaveProperties).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Новое название' }),
    );
  });

  it('правит описание по месту', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });
    await startEditing();

    await fireEvent.click(screen.getByLabelText('Изменить: описание'));
    await fireEvent.input(screen.getByLabelText('Текст описания'), {
      target: { value: 'Новое описание' },
    });
    await fireEvent.click(screen.getByTestId('book-edit-save'));

    expect(onSaveProperties).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Новое описание' }),
    );
  });

  it('добавляет описание книги, у которой его не было', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, {
      props: pageProps({ book: book({ description: undefined }), onSaveProperties }),
    });
    await startEditing();

    await fireEvent.click(screen.getByRole('button', { name: 'Добавить описание' }));
    await fireEvent.input(screen.getByLabelText('Текст описания'), {
      target: { value: 'Появившееся описание' },
    });
    await fireEvent.click(screen.getByTestId('book-edit-save'));

    expect(onSaveProperties).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Появившееся описание' }),
    );
  });

  it('правит каждого автора отдельно и убирает его из списка', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });
    await startEditing();

    // Авторов видно по отдельности: их может быть несколько.
    expect(screen.getByTestId('book-author-0').textContent).toContain('Автор');
    expect(screen.getByTestId('book-author-1').textContent).toContain('Соавтор');

    await fireEvent.click(screen.getByTestId('book-author-remove-1'));

    expect(onSaveProperties).toHaveBeenCalledWith(expect.objectContaining({ authors: ['Автор'] }));
  });

  it('добавляет автора в список', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });
    await startEditing();

    await fireEvent.input(screen.getByPlaceholderText('Добавить автора'), {
      target: { value: 'Новый автор' },
    });
    await fireEvent.click(screen.getByTestId('book-author-add'));

    expect(onSaveProperties).toHaveBeenCalledWith(
      expect.objectContaining({ authors: ['Автор', 'Соавтор', 'Новый автор'] }),
    );
  });

  it('правит отдельный тег и убирает его из списка', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });
    await startEditing();

    expect(screen.getByTestId('book-tag-0').textContent).toContain('тег');
    await fireEvent.click(screen.getByTestId('book-tag-remove-0'));

    expect(onSaveProperties).toHaveBeenCalledWith(expect.objectContaining({ tags: ['второй'] }));
  });

  it('добавляет тег в список', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });
    await startEditing();

    await fireEvent.input(screen.getByPlaceholderText('Добавить тег'), {
      target: { value: 'новый' },
    });
    await fireEvent.click(screen.getByTestId('book-tag-add'));

    expect(onSaveProperties).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['тег', 'второй', 'новый'] }),
    );
  });

  it('возвращает значения файла из режима правки', async () => {
    const onResetProperties = vi.fn();
    render(BookPage, {
      props: pageProps({ onResetProperties, userEntry: { title: 'Правка' } }),
    });
    await startEditing();

    await fireEvent.click(screen.getByTestId('book-edit-reset'));

    expect(onResetProperties).toHaveBeenCalledTimes(1);
  });

  it('не сбрасывает правки, когда их нет', async () => {
    render(BookPage, { props: pageProps() });
    await startEditing();

    expect(screen.queryByTestId('book-edit-reset')).toBeNull();
  });

  it('правит язык и издателя по месту, каждое своим полем', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });
    await startEditing();

    await fireEvent.click(screen.getByLabelText('Изменить: Язык'));
    await fireEvent.input(screen.getByLabelText('Язык'), { target: { value: 'en' } });
    await fireEvent.click(screen.getByTestId('book-edit-save'));

    expect(onSaveProperties).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en' }));

    await fireEvent.click(screen.getByLabelText('Изменить: Издатель'));
    await fireEvent.input(screen.getByLabelText('Издатель'), { target: { value: 'Другое' } });
    await fireEvent.click(screen.getByTestId('book-edit-save'));

    expect(onSaveProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({ publisher: 'Другое' }),
    );
  });

  it('сохраняет однострочное поле по Enter', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });
    await startEditing();

    await fireEvent.click(screen.getByLabelText('Изменить: Название'));
    const input = screen.getByLabelText('Название');
    await fireEvent.input(input, { target: { value: 'По Enter' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSaveProperties).toHaveBeenCalledWith(expect.objectContaining({ title: 'По Enter' }));
  });

  it('пустое значение поля возвращает свойство к значению файла', async () => {
    const onSaveProperties = vi.fn();
    render(BookPage, { props: pageProps({ onSaveProperties }) });
    await startEditing();

    await fireEvent.click(screen.getByLabelText('Изменить: Издатель'));
    await fireEvent.input(screen.getByLabelText('Издатель'), { target: { value: '  ' } });
    await fireEvent.click(screen.getByTestId('book-edit-save'));

    expect(onSaveProperties).toHaveBeenCalledWith(
      expect.objectContaining({ publisher: undefined }),
    );
  });

  it('называет рабочее место, в которое попадёт книга', () => {
    render(BookPage, { props: pageProps({ targetWorkspaceName: 'Исследование' }) });

    expect(screen.getByTestId('book-read-epub').getAttribute('title')).toContain('Исследование');
  });
});
