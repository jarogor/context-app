import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SearchCreate from './SearchCreate.svelte';

describe('SearchCreate', () => {
  it('показывает поиск и обновляет запрос', async () => {
    render(SearchCreate, { props: { searchPlaceholder: 'Поиск' } });

    const input = screen.getByPlaceholderText('Поиск') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'мысль' } });

    expect(input.value).toBe('мысль');
  });

  it('создаёт элемент по кнопке и очищает поле', async () => {
    const onCreate = vi.fn();

    render(SearchCreate, {
      props: { createPlaceholder: 'Новое', createTitle: 'Добавить', onCreate },
    });

    const input = screen.getByPlaceholderText('Новое') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Первое' } });
    await fireEvent.click(screen.getByLabelText('Добавить'));

    expect(onCreate).toHaveBeenCalledWith('Первое');
    expect(input.value).toBe('');
  });

  it('создаёт элемент по Enter', async () => {
    const onCreate = vi.fn();

    render(SearchCreate, {
      props: { createPlaceholder: 'Новое', createTitle: 'Добавить', onCreate },
    });

    const input = screen.getByPlaceholderText('Новое') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Второе' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCreate).toHaveBeenCalledWith('Второе');
  });

  it('не создаёт элемент с пустым именем и блокирует кнопку', async () => {
    const onCreate = vi.fn();

    render(SearchCreate, {
      props: { createPlaceholder: 'Новое', createTitle: 'Добавить', onCreate },
    });

    const input = screen.getByPlaceholderText('Новое') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '   ' } });

    expect((screen.getByLabelText('Добавить') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCreate).not.toHaveBeenCalled();
  });
});
