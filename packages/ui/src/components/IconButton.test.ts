import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import IconButton from './IconButton.svelte';

describe('IconButton', () => {
  it('рисует кнопку добавления с подписью по умолчанию', () => {
    render(IconButton, { props: { action: 'add' } });

    expect(screen.getByLabelText('Добавить')).toBeTruthy();
  });

  it('рисует кнопку удаления и вызывает обработчик', async () => {
    const onclick = vi.fn();

    render(IconButton, { props: { action: 'delete', onclick } });
    await fireEvent.click(screen.getByLabelText('Удалить'));

    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('рисует кнопку изменения', () => {
    render(IconButton, { props: { action: 'edit' } });

    expect(screen.getByLabelText('Изменить')).toBeTruthy();
  });

  it('переопределяет подпись и доступное имя', () => {
    render(IconButton, {
      props: { action: 'delete', title: 'Удалить плагин', ariaLabel: 'Удалить плагин' },
    });

    const button = screen.getByLabelText('Удалить плагин');
    expect(button.getAttribute('title')).toBe('Удалить плагин');
  });

  it('передаёт недоступность', () => {
    render(IconButton, { props: { action: 'delete', disabled: true } });

    expect((screen.getByLabelText('Удалить') as HTMLButtonElement).disabled).toBe(true);
  });
});
