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

  it('выравнивает счётчики вправо на любой ширине', () => {
    // На телефоне полоса управления переносит поиск и счётчики друг под
    // друга; счётчики должны стоять справа, а не липнуть к левому краю.
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', book_title: 'Книга A', name: 'Основные' })],
      },
    });

    const counters = screen.getByText('Наборов').closest('dl');
    expect(counters?.className).toContain('ml-auto');
    expect(counters?.className).not.toContain('sm:ml-auto');
  });

  it('показывает наборы свёрнутыми: имя набора и книга-подпись без заметок', () => {
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({ id: 'ns-1', book_key: '/a.pdf', book_title: 'Книга A', name: 'Основные' }),
          set({
            id: 'ns-2',
            book_key: '/b.pdf',
            book_title: 'Книга B',
            name: 'Черновики',
            notes: [{ id: 'n1', quote: 'цитата' }],
          }),
        ],
      },
    });

    const sections = screen.getAllByTestId('notes-library-set');
    expect(sections).toHaveLength(2);
    // Имя набора — акцент; книга — подпись рядом.
    expect(within(sections[0]).getByTestId('notes-library-set-name').textContent).toBe('Основные');
    expect(within(sections[0]).getByTestId('notes-library-book').textContent).toBe('Книга A');
    // Заметки свёрнуты: списка заметок в свёрнутом наборе нет.
    expect(within(sections[1]).queryByTestId('notes-library-notes')).toBeNull();
  });

  it('раскрывает заметки набора по клику', async () => {
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({
            id: 'ns-1',
            book_key: '/a.pdf',
            book_title: 'Книга A',
            name: 'Основные',
            notes: [{ id: 'n1', quote: 'цитата' }],
          }),
        ],
      },
    });

    const section = screen.getByTestId('notes-library-set');
    expect(within(section).queryByTestId('notes-library-notes')).toBeNull();

    await fireEvent.click(within(section).getByTestId('notes-library-set-toggle'));

    const notes = within(section).getByTestId('notes-library-notes');
    expect(within(notes).getByTestId('notes-item-link').textContent).toContain('цитата');

    // Повторный клик сворачивает набор обратно.
    await fireEvent.click(within(section).getByTestId('notes-library-set-toggle'));
    expect(within(section).queryByTestId('notes-library-notes')).toBeNull();
  });

  it('выводит резервное имя книги без сохранённого', () => {
    render(NotesLibraryPage, {
      props: { sets: [set({ id: 'ns-1', book_key: '/home/user/Downloads/book.pdf' })] },
    });
    expect(screen.getByTestId('notes-library-book').textContent).toContain('book');
  });

  it('показывает пустой набор информативно после раскрытия', async () => {
    render(NotesLibraryPage, {
      props: { sets: [set({ id: 'ns-1', book_key: '/a.pdf', name: 'A' })] },
    });
    const section = screen.getByTestId('notes-library-set');
    expect(within(section).queryByTestId('notes-library-set-empty')).toBeNull();
    await fireEvent.click(within(section).getByTestId('notes-library-set-toggle'));
    expect(within(section).getByTestId('notes-library-set-empty').textContent).toContain(
      'нет заметок',
    );
  });

  it('показывает число заметок словами', () => {
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({
            id: 'ns-1',
            book_key: '/a.pdf',
            name: 'A',
            notes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }],
          }),
        ],
      },
    });
    expect(screen.getByTestId('notes-library-set').textContent).toContain('3 заметки');
  });

  it('при поиске раскрывает только подходящие заметки', async () => {
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({
            id: 'ns-1',
            book_key: '/a.pdf',
            book_title: 'Книга A',
            name: 'A',
            notes: [{ id: 'n1', quote: 'другое' }],
          }),
          set({
            id: 'ns-2',
            book_key: '/b.pdf',
            book_title: 'Книга B',
            name: 'B',
            notes: [{ id: 'n2', quote: 'Хайдеггер' }],
          }),
        ],
      },
    });

    await fireEvent.input(screen.getByPlaceholderText('Поиск по заметкам'), {
      target: { value: 'хайдеггер' },
    });

    const sections = screen.getAllByTestId('notes-library-set');
    expect(sections).toHaveLength(1);
    expect(within(sections[0]).getByTestId('notes-library-book').textContent).toBe('Книга B');
    // Найденная заметка видна без отдельного раскрытия.
    const notes = within(sections[0]).getByTestId('notes-library-notes');
    expect(within(notes).getByTestId('notes-item-link').textContent).toContain('Хайдеггер');
  });

  it('сообщает об отсутствии результатов поиска', async () => {
    render(NotesLibraryPage, {
      props: { sets: [set({ id: 'ns-1', book_key: '/a.pdf', book_title: 'Книга A' })] },
    });
    await fireEvent.input(screen.getByPlaceholderText('Поиск по заметкам'), {
      target: { value: 'нет такого' },
    });
    expect(screen.getByTestId('notes-library-empty').textContent).toContain('ничего не найдено');
  });

  it('сообщает об ошибке загрузки', () => {
    render(NotesLibraryPage, { props: { sets: [], error: 'сбой' } });
    expect(screen.getByTestId('notes-library-error').textContent).toContain('сбой');
  });

  it('отдаёт интент перехода к книге из меню набора', async () => {
    const onOpenSet = vi.fn();
    render(NotesLibraryPage, {
      props: {
        sets: [set({ id: 'ns-1', book_key: '/a.pdf', book_title: 'Книга A', name: 'A' })],
        onOpenSet,
      },
    });

    await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
    await fireEvent.click(await screen.findByText('Открыть книгу'));

    expect(onOpenSet).toHaveBeenCalledTimes(1);
    expect(onOpenSet.mock.calls[0][0].id).toBe('ns-1');
  });

  it('отдаёт интент перехода к заметке', async () => {
    const onOpenNote = vi.fn();
    render(NotesLibraryPage, {
      props: {
        sets: [
          set({
            id: 'ns-1',
            book_key: '/a.pdf',
            book_title: 'Книга A',
            notes: [{ id: 'n1', quote: 'Мысль' }],
          }),
        ],
        onOpenNote,
      },
    });

    await fireEvent.click(screen.getByTestId('notes-library-set-toggle'));
    await fireEvent.click(screen.getByTestId('notes-item-link'));

    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenNote.mock.calls[0][1].id).toBe('n1');
  });
});
