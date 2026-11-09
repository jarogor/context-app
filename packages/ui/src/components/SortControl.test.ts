// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SortControl from './SortControl.svelte';

/** Варианты поля порядка для проверок. */
const ITEMS = [
  { value: 'title', label: 'По названию' },
  { value: 'added', label: 'По дате добавления' },
];

describe('SortControl', () => {
  it('показывает поле порядка и кнопку направления одним контролом', () => {
    render(SortControl, {
      props: {
        items: ITEMS,
        value: 'title',
        direction: 'asc',
        ariaLabel: 'Сортировка',
        onchange: vi.fn(),
        ondirection: vi.fn(),
        testId: 'list-sort',
      },
    });

    const control = screen.getByTestId('list-sort');
    // Поле и направление живут внутри одного контрола.
    expect(control.querySelector('[aria-label="Сортировка"]')).toBeTruthy();
    expect(control.querySelector('[data-testid="list-sort-direction"]')).toBeTruthy();
  });

  it('передаёт выбранное поле в обработчик', async () => {
    const onchange = vi.fn();
    render(SortControl, {
      props: {
        items: ITEMS,
        value: 'title',
        direction: 'asc',
        ariaLabel: 'Сортировка',
        onchange,
        ondirection: vi.fn(),
      },
    });

    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Сортировка' }), {
      button: 0,
    });
    await fireEvent.pointerUp(screen.getByRole('option', { name: 'По дате добавления' }));

    expect(onchange).toHaveBeenCalledWith('added');
  });

  it('переключает направление и называет сторону, на которую переключит', async () => {
    const ondirection = vi.fn();
    render(SortControl, {
      props: {
        items: ITEMS,
        value: 'title',
        direction: 'asc',
        ariaLabel: 'Сортировка',
        onchange: vi.fn(),
        ondirection,
        testId: 'mode-sort',
      },
    });

    const direction = screen.getByTestId('mode-sort-direction');
    // Показывается текущая сторона, подсказка называет действие.
    expect(direction.getAttribute('aria-label')).toBe('По убыванию');

    await fireEvent.click(direction);
    expect(ondirection).toHaveBeenCalledWith('desc');
  });

  it('на убывании предлагает переключение на возрастание', () => {
    render(SortControl, {
      props: {
        items: ITEMS,
        value: 'title',
        direction: 'desc',
        ariaLabel: 'Сортировка',
        onchange: vi.fn(),
        ondirection: vi.fn(),
        testId: 'desc-sort',
      },
    });

    expect(screen.getByTestId('desc-sort-direction').getAttribute('aria-label')).toBe(
      'По возрастанию',
    );
  });
});
