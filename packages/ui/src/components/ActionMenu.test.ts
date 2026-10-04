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

  it('показывает образцы цветов и передаёт выбранный цвет', async () => {
    const oncolorselect = vi.fn();
    render(ActionMenu, {
      props: {
        items: ITEMS,
        ariaLabel: 'Действия',
        colors: [
          { id: 'yellow', label: 'жёлтый', color: '#fde68a', selected: true },
          { id: 'green', label: 'зелёный', color: '#bbf7d0' },
        ],
        colorsLabel: 'Цвет заметки',
        oncolorselect,
      },
    });

    await fireEvent.pointerDown(screen.getByLabelText('Действия'), { button: 0 });
    await fireEvent.click(screen.getByLabelText('зелёный'));

    expect(oncolorselect).toHaveBeenCalledWith('green');
  });
});
