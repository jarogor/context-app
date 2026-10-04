import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import ActionMenu from './ActionMenu.svelte';
import type { MenuAction } from './ActionMenu.svelte';

const ITEMS: MenuAction[] = [
  { id: 'rename', label: 'Переименовать' },
  { id: 'delete', label: 'Удалить', destructive: true },
];

describe('ActionMenu', () => {
  it('передаёт выбранное действие в обработчик', async () => {
    const onselect = vi.fn();
    render(ActionMenu, { props: { items: ITEMS, onselect, ariaLabel: 'Действия' } });

    await fireEvent.pointerDown(screen.getByLabelText('Действия'), { button: 0 });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));

    expect(onselect).toHaveBeenCalledWith('delete');
  });

  it('не открывает недоступный пункт', async () => {
    const onselect = vi.fn();
    render(ActionMenu, {
      props: {
        items: [{ id: 'delete', label: 'Удалить', disabled: true }],
        onselect,
        ariaLabel: 'Действия',
      },
    });

    await fireEvent.pointerDown(screen.getByLabelText('Действия'), { button: 0 });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));

    expect(onselect).not.toHaveBeenCalled();
  });
});
