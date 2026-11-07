import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SetBookDialog from './SetBookDialog.svelte';

/** Набор, которому указывают книгу. */
const target = {
  id: 'ns-9',
  name: 'Поделились',
  noteCount: 2,
  bookHint: 'Чужая книга',
};

/** Книги библиотеки для выбора. */
const books = [
  { key: '/lib/demo-1.epub', name: 'demo-1.epub', title: 'Демо-книга' },
  { key: '/lib/demo-3.epub', name: 'demo-3.epub', title: 'Третья книга' },
];

/** Общие обработчики диалога. */
function handlers() {
  return { onSelect: vi.fn(), onPickFile: vi.fn(), onClose: vi.fn() };
}

describe('диалог указания книги набора', () => {
  it('показывает набор, число заметок и подсказку о книге', () => {
    render(SetBookDialog, { props: { open: true, target, books, ...handlers() } });

    expect(screen.getByTestId('bind-set-name').textContent).toContain('Поделились');
    expect(screen.getByTestId('bind-set-notes').textContent).toContain('2');
    expect(screen.getByTestId('bind-set-hint').textContent).toContain('Чужая книга');
  });

  it('сообщает, что книга набора не указана', () => {
    render(SetBookDialog, {
      props: { open: true, target: { ...target, bookHint: '' }, books, ...handlers() },
    });

    expect(screen.getByTestId('bind-set-hint').textContent).toContain('не указана');
  });

  it('привязывает набор к выбранной книге из библиотеки', async () => {
    const onSelect = vi.fn();
    render(SetBookDialog, {
      props: { open: true, target, books, onSelect, onPickFile: vi.fn(), onClose: vi.fn() },
    });

    const items = screen.getAllByTestId('bind-book-item');
    expect(items).toHaveLength(2);
    await fireEvent.click(items[1]);
    expect(onSelect).toHaveBeenCalledWith({ key: '/lib/demo-3.epub', title: 'Третья книга' });
  });

  it('ставит книгу из подсказки первой', () => {
    render(SetBookDialog, {
      props: { open: true, target: { ...target, bookHint: 'Третья книга' }, books, ...handlers() },
    });

    expect(screen.getAllByTestId('bind-book-item')[0].textContent).toContain('Третья книга');
  });

  it('фильтрует книги поиском', async () => {
    render(SetBookDialog, { props: { open: true, target, books, ...handlers() } });

    await fireEvent.input(screen.getByPlaceholderText('Поиск книги'), {
      target: { value: 'третья' },
    });

    const items = screen.getAllByTestId('bind-book-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('Третья книга');
  });

  it('позволяет указать файл книги, которой нет в библиотеке', async () => {
    const onPickFile = vi.fn();
    render(SetBookDialog, {
      props: { open: true, target, books: [], onSelect: vi.fn(), onPickFile, onClose: vi.fn() },
    });

    expect(screen.getByTestId('bind-books-empty')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Указать файл книги/ }));
    expect(onPickFile).toHaveBeenCalledTimes(1);
  });

  it('сообщает об ошибке загрузки книг', () => {
    render(SetBookDialog, {
      props: {
        open: true,
        target,
        books: [],
        error: 'каталог недоступен',
        onSelect: vi.fn(),
        onPickFile: vi.fn(),
        onClose: vi.fn(),
      },
    });

    expect(screen.getByTestId('bind-books-error').textContent).toContain('каталог недоступен');
  });
});
