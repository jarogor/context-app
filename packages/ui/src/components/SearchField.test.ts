// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SearchField from './SearchField.svelte';

describe('SearchField', () => {
  it('обновляет запрос при вводе', async () => {
    render(SearchField, { props: { placeholder: 'Поиск', ariaLabel: 'Поиск' } });

    const input = screen.getByLabelText('Поиск') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'мысль' } });

    expect(input.value).toBe('мысль');
  });

  it('держит счётчик внутри поля', () => {
    render(SearchField, {
      props: {
        placeholder: 'Поиск',
        ariaLabel: 'Поиск',
        shown: 2,
        total: 5,
        counterTestId: 'counter',
      },
    });

    const counter = screen.getByTestId('counter');
    // Счётчик — часть поля, а не соседний элемент.
    expect(counter.closest('[data-search-field]')).toBeTruthy();
    expect(counter.textContent).toBe('2 из 5');
  });

  it('без чисел счётчика не показывает', () => {
    render(SearchField, { props: { placeholder: 'Поиск', ariaLabel: 'Поиск' } });

    expect(screen.queryByTestId('counter')).toBeNull();
  });

  it('показывает счётчик и при полном совпадении', () => {
    render(SearchField, {
      props: { placeholder: 'Поиск', ariaLabel: 'Поиск', shown: 3, total: 3, counterTestId: 'c' },
    });

    expect(screen.getByTestId('c').textContent).toBe('3 из 3');
  });

  it('очищает запрос кнопкой и уведомляет об изменении', async () => {
    const oninput = vi.fn();
    render(SearchField, {
      props: { placeholder: 'Поиск', ariaLabel: 'Поиск', value: 'текст', clearable: true, oninput },
    });

    await fireEvent.click(screen.getByLabelText('Очистить поиск'));

    expect(oninput).toHaveBeenCalled();
    expect((screen.getByLabelText('Поиск') as HTMLInputElement).value).toBe('');
  });

  it('не показывает очистку в пустом поле', () => {
    render(SearchField, { props: { placeholder: 'Поиск', ariaLabel: 'Поиск', clearable: true } });

    expect(screen.queryByLabelText('Очистить поиск')).toBeNull();
  });
});
