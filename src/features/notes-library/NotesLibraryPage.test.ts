import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NotesLibraryPage from './NotesLibraryPage.svelte';
import { normalizeSet } from '../notes/notes';

/** Набор реестра из сырого ответа плагина. */
function set(raw: Record<string, unknown>) {
  return normalizeSet(raw);
}

describe('библиотека заметок', () => {
  it('показывает пустое состояние без наборов', () => {
    render(NotesLibraryPage, { props: { sets: [] } });
    expect(screen.getByTestId('notes-library-empty').textContent).toContain('пока нет');
  });

  it('справа показывает только число заметок', () => {
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'Основные' })],
      },
    });
    const counters = screen.getByText('Заметок').closest('dl');
    expect(counters?.className).toContain('ml-auto');
    expect(screen.queryByText('Наборов')).toBeNull();
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
