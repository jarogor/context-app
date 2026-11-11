import { fireEvent, render, screen, within, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotesLibraryPage from './NotesLibraryPage.svelte';
import {
  bindNoteSetBook,
  completeNoteSetImport,
  exportNoteSet,
  normalizeSet,
  pickBookFile,
  prepareNoteSetImport,
  type NoteSetImport,
} from '../notes/notes';
import { bookChoices } from '../library/library';

vi.mock('../notes/notes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../notes/notes')>();
  return {
    ...actual,
    exportNoteSet: vi.fn(async () => null),
    prepareNoteSetImport: vi.fn(async () => null),
    pickBookFile: vi.fn(async () => null),
    completeNoteSetImport: vi.fn(async () => null),
    bindNoteSetBook: vi.fn(async () => null),
  };
});

vi.mock('../library/library', () => ({
  bookChoices: vi.fn(async () => []),
}));

const prepare = vi.mocked(prepareNoteSetImport);
const complete = vi.mocked(completeNoteSetImport);
const exportSet = vi.mocked(exportNoteSet);
const pickFile = vi.mocked(pickBookFile);
const bindBook = vi.mocked(bindNoteSetBook);
const choices = vi.mocked(bookChoices);

beforeEach(() => {
  prepare.mockReset().mockResolvedValue(null);
  complete
    .mockReset()
    .mockResolvedValue(normalizeSet({ id: 'ns-mock', book_key: '/lib/a.epub', name: 'Набор' }));
  exportSet.mockReset().mockResolvedValue(null);
  pickFile.mockReset().mockResolvedValue(null);
  bindBook
    .mockReset()
    .mockResolvedValue(
      normalizeSet({ id: 'ns-9', book_key: '/lib/Книга.epub', name: 'Поделились' }),
    );
  choices.mockReset().mockResolvedValue([]);
});

/** Набор реестра из сырого ответа плагина. */
function set(raw: Record<string, unknown>) {
  return normalizeSet(raw);
}

describe('библиотека заметок', () => {
  it('показывает пустое состояние без наборов', () => {
    render(NotesLibraryPage, { props: { sets: [] } });
    expect(screen.getByTestId('notes-library-empty').textContent).toContain('пока нет');
  });

  it('ставит общее число заметок рядом с поиском по наборам', () => {
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({ id: 'ns-1', book_key: '/a.pdf', name: 'Основные', notes: [{ id: 'n1' }] }),
          set({ id: 'ns-2', book_key: '/b.pdf', name: 'Дополнительные', notes: [{ id: 'n2' }] }),
        ],
      },
    });
    // Счётчик найденного — внутри поля поиска, общее число заметок — рядом.
    const search = screen.getByTestId('notes-filter-counter');
    const total = screen.getByTestId('notes-total-counter');
    expect(total.textContent).toContain('Заметок');
    expect(total.textContent).toContain('2');
    expect(search.closest('[data-search-field]')).toBeTruthy();
    // Число заметок — не часть поля поиска: оно про весь реестр.
    expect(search.closest('[data-search-field]')?.contains(total)).toBe(false);
    expect(total.className).not.toContain('ml-auto');
    expect(screen.queryByText('Наборов')).toBeNull();
  });

  it('справа показывает кнопку импорта', async () => {
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'Основные' })],
      },
    });
    const button = screen.getByRole('button', { name: 'Импорт' });
    expect(button.getAttribute('title')).toBe('Импортировать набор заметок из файла');
    await fireEvent.click(button);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('принимает набор сразу, без вопроса о книге', async () => {
    const pending: NoteSetImport = {
      path: '/tmp/Чужая книга.notes.json',
      name: 'Поделились',
      noteCount: 1,
      book: { name: 'Чужая книга.epub', title: 'Чужая книга' },
    };
    prepare.mockResolvedValue(pending);

    render(NotesLibraryPage, { props: { sets: [] } });
    await fireEvent.click(screen.getByRole('button', { name: 'Импорт' }));

    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    // Набор принимается без книги: её можно указать позже.
    expect(complete.mock.calls[0][0]).toEqual(pending);
    expect(choices).not.toHaveBeenCalled();
  });

  it('помечает набор без книги и не даёт его открыть', async () => {
    const onOpenSet = vi.fn();
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({
            id: 'ns-1',
            book_key: '',
            book_title: 'Чужая книга',
            name: 'Поделились',
            notes: [{ id: 'n1', quote: 'цитата' }],
          }),
        ],
        workspaces: [{ id: 'ws-1', name: 'Место' }],
        onOpenSet,
      },
    });

    // Надпись о книге выделена: набор без книги не открыть, пока её не указали.
    const noBook = screen.getByTestId('notes-library-no-book');
    expect(noBook.textContent).toBe('Книга не указана');
    expect(noBook.className).toContain('font-medium');
    expect(noBook.parentElement?.getAttribute('title')).toBe(
      'Набор без книги: укажите книгу в меню набора',
    );

    // Строка недоступна для открытия: панель выбора места не появляется.
    const row = screen.getByTestId('notes-library-set-toggle');
    expect(row).toHaveProperty('disabled', true);
    await fireEvent.click(row);
    expect(screen.queryByTestId('notes-set-panel')).toBeNull();
    expect(onOpenSet).not.toHaveBeenCalled();
  });

  it('раскрывает заметки набора без книги: их видно и можно искать', async () => {
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({
            id: 'ns-1',
            book_key: '',
            name: 'Поделились',
            notes: [{ id: 'n1', quote: 'цитата из файла' }],
          }),
        ],
      },
    });

    await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
    await fireEvent.click(await screen.findByText('Показать заметки'));
    expect(screen.getByTestId('notes-item-link').textContent).toContain('цитата из файла');
  });

  it('привязывает набор к книге, выбранной в диалоге', async () => {
    choices.mockResolvedValue([
      { key: '/lib/Чужая книга.epub', name: 'Чужая книга.epub', title: 'Чужая книга' },
    ]);
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '', book_title: 'Чужая книга', name: 'Поделились' })],
      },
    });

    await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
    await fireEvent.click(await screen.findByText('Указать книгу'));

    const book = await screen.findByTestId('bind-book-item');
    await fireEvent.click(book);

    expect(bindBook).toHaveBeenCalledTimes(1);
    expect(bindBook.mock.calls[0][0]).toBe('ns-1');
    expect(bindBook.mock.calls[0][1]).toEqual({
      key: '/lib/Чужая книга.epub',
      title: 'Чужая книга',
    });
  });

  it('привязывает набор к книге, файл которой указан вручную', async () => {
    pickFile.mockResolvedValue({ key: '/моя/книга.epub', title: '' });
    render(NotesLibraryPage, {
      props: { sets: [set({ id: 'ns-1', book_key: '', name: 'Поделились' })] },
    });

    await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
    await fireEvent.click(await screen.findByText('Указать книгу'));
    await fireEvent.click(await screen.findByRole('button', { name: /Указать файл книги/ }));

    expect(bindBook.mock.calls[0][1]).toEqual({ key: '/моя/книга.epub', title: '' });
  });

  it('у привязанного набора предлагает указать другую книгу', async () => {
    render(NotesLibraryPage, {
      props: { sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'Основные' })] },
    });

    await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
    expect(await screen.findByText('Указать другую книгу')).toBeTruthy();
  });

  it('экспортирует набор пунктом меню вместе с именем файла книги', async () => {
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'Основные' })],
      },
    });
    await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
    await fireEvent.click(await screen.findByText('Экспорт'));
    expect(exportSet).toHaveBeenCalledTimes(1);
    expect(exportSet).toHaveBeenCalledWith('ns-1', 'a.pdf');
  });

  it('сообщает об ошибке импорта всплывающим сообщением', async () => {
    prepare.mockRejectedValue(new Error('файл набора заметок не читается'));
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'Основные' })],
      },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Импорт' }));
    const toast = await screen.findByRole('alert');
    expect(toast.textContent).toContain('файл набора заметок не читается');
  });

  it('показывает набор, а книгу — полным путём моноширинным', () => {
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/lib/Книга A.pdf', name: 'Основные' })],
      },
    });
    expect(screen.getByTestId('notes-library-set-name').textContent).toBe('Основные');
    const book = screen.getByTestId('notes-library-book');
    expect(book.textContent).toContain('Книга A.pdf');
    expect(book.className).toContain('font-mono');
    // Пометки «не записано» больше нет.
    expect(screen.queryByTestId('notes-library-workspace')).toBeNull();
  });

  it('выводит последнее место открытия из истории', () => {
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'A' })],
        workspaces: [
          { id: 'ws-1', name: 'Первое' },
          { id: 'ws-2', name: 'Второе' },
        ],
        workspaceHistory: { 'ns-1': ['ws-2', 'ws-1'] },
      },
    });
    expect(screen.getByTestId('notes-library-workspace').textContent).toBe('Второе');
  });

  it('раскрывает заметки набором пунктом меню', async () => {
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({
            id: 'ns-1',
            book_key: '/a.pdf',
            name: 'Основные',
            notes: [{ id: 'n1', quote: 'цитата' }],
          }),
        ],
      },
    });

    expect(screen.queryByTestId('notes-library-notes')).toBeNull();
    await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
    await fireEvent.click(await screen.findByText('Показать заметки'));
    expect(
      within(screen.getByTestId('notes-library-set')).getByTestId('notes-item-link'),
    ).toBeTruthy();

    await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
    await fireEvent.click(await screen.findByText('Скрыть заметки'));
    expect(screen.queryByTestId('notes-library-notes')).toBeNull();
  });

  it('открывает панель выбора и показывает два списка мест', () => {
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/lib/book.epub', name: 'A' })],
        workspaces: [
          { id: 'ws-1', name: 'Первое' },
          { id: 'ws-2', name: 'Второе' },
          { id: 'ws-3', name: 'Третье' },
        ],
        workspaceHistory: { 'ns-1': ['ws-2'] },
      },
    });

    expect(screen.queryByTestId('notes-set-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('notes-library-set-toggle'));

    const panel = screen.getByTestId('notes-set-panel');
    expect(within(panel).getByTestId('notes-set-book').textContent).toContain('book.epub');
    // Где открывалось — первым, затем остальные.
    expect(within(panel).getByText('Последнее открытие:')).toBeTruthy();
    expect(within(panel).getByTestId('notes-set-history-item').textContent).toContain('Второе');
    const others = within(panel).getAllByTestId('notes-set-workspace-item');
    expect(others.map((item) => item.textContent?.trim())).toEqual(['Первое', 'Третье']);
    // Форма создания не показывается по умолчанию.
    expect(within(panel).queryByPlaceholderText('Новое рабочее место')).toBeNull();
  });

  it('скрывает места, которых уже нет на устройстве', () => {
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'A' })],
        workspaces: [{ id: 'ws-1', name: 'Первое' }],
        workspaceHistory: { 'ns-1': ['ws-gone', 'ws-1'] },
      },
    });
    fireEvent.click(screen.getByTestId('notes-library-set-toggle'));
    const panel = screen.getByTestId('notes-set-panel');
    expect(within(panel).getAllByTestId('notes-set-history-item')).toHaveLength(1);
    expect(within(panel).getByTestId('notes-set-history-item').textContent).toContain('Первое');
    expect(within(panel).queryAllByTestId('notes-set-workspace-item')).toHaveLength(0);
  });

  it('отдаёт интент открытия набора в выбранном месте', async () => {
    const onOpenSet = vi.fn();
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'A' })],
        workspaces: [{ id: 'ws-1', name: 'Первое' }],
        onOpenSet,
      },
    });
    fireEvent.click(screen.getByTestId('notes-library-set-toggle'));
    await fireEvent.click(screen.getByTestId('notes-set-workspace-item'));
    expect(onOpenSet).toHaveBeenCalledTimes(1);
    expect(onOpenSet.mock.calls[0][1]).toBe('ws-1');
  });

  it('запоминает выбранную заметку и открывает её в выбранном месте', async () => {
    const onOpenNote = vi.fn();
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({
            id: 'ns-1',
            book_key: '/a.pdf',
            name: 'A',
            notes: [{ id: 'n1', quote: 'цитата' }],
          }),
        ],
        workspaces: [{ id: 'ws-1', name: 'Первое' }],
        onOpenNote,
      },
    });
    await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
    await fireEvent.click(await screen.findByText('Показать заметки'));
    await fireEvent.click(screen.getByTestId('notes-item-link'));
    expect(screen.getByTestId('notes-item').getAttribute('data-selected')).toBe('true');
    await fireEvent.click(screen.getByTestId('notes-set-workspace-item'));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenNote.mock.calls[0][1].id).toBe('n1');
    expect(onOpenNote.mock.calls[0][2]).toBe('ws-1');
  });

  it('показывает форму создания только по кнопке и создаёт место', async () => {
    const onCreateWorkspace = vi.fn();
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'A' })],
        workspaces: [{ id: 'ws-1', name: 'Первое' }],
        onCreateWorkspace,
      },
    });
    fireEvent.click(screen.getByTestId('notes-library-set-toggle'));
    expect(screen.queryByPlaceholderText('Новое рабочее место')).toBeNull();

    await fireEvent.click(screen.getByTestId('notes-set-create-workspace'));
    await fireEvent.input(screen.getByPlaceholderText('Новое рабочее место'), {
      target: { value: 'Новое' },
    });
    await fireEvent.click(screen.getByLabelText('Создать'));
    expect(onCreateWorkspace).toHaveBeenCalledTimes(1);
    expect(onCreateWorkspace.mock.calls[0][1]).toBe('Новое');
    expect(onCreateWorkspace.mock.calls[0][2]).toBeNull();
  });

  it('фильтрует места поиском панели', async () => {
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'A' })],
        workspaces: [
          { id: 'ws-1', name: 'Альфа' },
          { id: 'ws-2', name: 'Бета' },
        ],
      },
    });
    fireEvent.click(screen.getByTestId('notes-library-set-toggle'));
    await fireEvent.input(screen.getByPlaceholderText('Поиск рабочего места'), {
      target: { value: 'бета' },
    });
    const items = screen.getAllByTestId('notes-set-workspace-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('Бета');
  });

  it('закрывает панель и оставляет реестр', async () => {
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'A' })],
        workspaces: [{ id: 'ws-1', name: 'Первое' }],
      },
    });
    fireEvent.click(screen.getByTestId('notes-library-set-toggle'));
    expect(screen.getByTestId('notes-set-panel')).toBeTruthy();
    await fireEvent.click(screen.getByTestId('side-panel-close'));
    expect(screen.queryByTestId('notes-set-panel')).toBeNull();
    expect(screen.getByTestId('notes-library')).toBeTruthy();
  });

  it('сообщает об ошибке загрузки', () => {
    render(NotesLibraryPage, { props: { sets: [], error: 'сбой' } });
    expect(screen.getByTestId('notes-library-error').textContent).toContain('сбой');
  });
});

describe('полоса управления реестра заметок', () => {
  it('ставит импорт слева от поиска, порядок — справа', () => {
    render(NotesLibraryPage, {
      props: { sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'A' })] },
    });

    const importButton = screen.getByRole('button', { name: 'Импорт' });
    const search = screen.getByTestId('notes-filter-counter').closest('[data-search-field]');
    const sort = screen.getByTestId('notes-library-sort');
    expect(importButton).toBeTruthy();
    expect(search).toBeTruthy();
    expect(sort).toBeTruthy();
    // Импорт стоит левее поля поиска.
    expect(
      importButton.compareDocumentPosition(search as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('упорядочивает наборы по дате изменения и по алфавиту', async () => {
    localStorage.clear();
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({ id: 'ns-1', book_key: '/a.pdf', name: 'Бета', created_at_millis: 1_000 }),
          set({ id: 'ns-2', book_key: '/b.pdf', name: 'Альфа', created_at_millis: 3_000 }),
        ],
      },
    });

    const names = () =>
      screen.getAllByTestId('notes-library-set-name').map((element) => element.textContent?.trim());
    // По умолчанию — по дате изменения, свежие сверху.
    expect(names()).toEqual(['Альфа', 'Бета']);

    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Порядок наборов' }), {
      button: 0,
    });
    await fireEvent.pointerUp(screen.getByRole('option', { name: 'По алфавиту' }));
    await waitFor(() => expect(names()).toEqual(['Альфа', 'Бета']));

    // Кнопка направления разворачивает порядок.
    await fireEvent.click(screen.getByTestId('notes-library-sort-direction'));
    await waitFor(() => expect(names()).toEqual(['Бета', 'Альфа']));
  });
});
