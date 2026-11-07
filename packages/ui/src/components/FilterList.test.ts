import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import FilterList from './FilterList.svelte';

/** Длинный список значений: у него появляется поиск. */
const many = Array.from({ length: 10 }, (_, index) => ({
  value: `v${index}`,
  label: `Автор ${index}`,
  count: index + 1,
}));

/** Короткий список: поиска нет. */
const few = [
  { value: 'epub', label: 'EPUB', count: 3 },
  { value: 'fb2', label: 'FB2', count: 1 },
];

describe('FilterList', () => {
  it('показывает значения с флажками и числом книг', () => {
    render(FilterList, {
      props: {
        items: few,
        selected: ['epub'],
        onToggle: vi.fn(),
        searchPlaceholder: 'Поиск',
        emptyText: 'Ничего не найдено',
      },
    });

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(screen.getByText('EPUB')).toBeTruthy();
    // Короткий список не получает поля поиска.
    expect(screen.queryByPlaceholderText('Поиск')).toBeNull();
  });

  it('ищет по подписи и сообщает о пустом результате', async () => {
    render(FilterList, {
      props: {
        items: many,
        selected: [],
        onToggle: vi.fn(),
        searchPlaceholder: 'Поиск',
        emptyText: 'Ничего не найдено',
      },
    });

    await fireEvent.input(screen.getByPlaceholderText('Поиск'), { target: { value: 'Автор 3' } });

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);

    await fireEvent.input(screen.getByPlaceholderText('Поиск'), {
      target: { value: 'нет такого' },
    });

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('Ничего не найдено')).toBeTruthy();
  });

  it('передаёт выбранное значение обработчику', async () => {
    const onToggle = vi.fn();
    render(FilterList, {
      props: {
        items: few,
        selected: [],
        onToggle,
        searchPlaceholder: 'Поиск',
        emptyText: 'Ничего не найдено',
      },
    });

    await fireEvent.click(screen.getAllByRole('checkbox')[0]);

    expect(onToggle).toHaveBeenCalledWith('epub');
  });
});
