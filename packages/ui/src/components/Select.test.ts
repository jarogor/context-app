import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import Select from './Select.svelte';

const ITEMS = [
  { value: 'a', label: 'Первый' },
  { value: 'b', label: 'Второй' },
];

describe('Select', () => {
  it('показывает выбранный вариант в триггере', () => {
    render(Select, { props: { value: 'b', items: ITEMS } });

    expect(screen.getByRole('button', { name: 'Второй' })).toBeTruthy();
  });

  it('передаёт выбранное значение в обработчик', async () => {
    const onchange = vi.fn();
    render(Select, { props: { value: 'a', items: ITEMS, onchange } });

    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Первый' }), { button: 0 });
    await fireEvent.pointerUp(screen.getByRole('option', { name: 'Второй' }));

    expect(onchange).toHaveBeenCalledWith('b');
  });

  it('показывает подпись-заглушку при пустом значении', () => {
    render(Select, { props: { value: '', items: ITEMS, placeholder: 'Выберите' } });

    expect(screen.getByRole('button', { name: 'Выберите' })).toBeTruthy();
  });
});
