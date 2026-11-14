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

  it('держит палитры цвета и иконок единым блоком без промежутка', async () => {
    render(ActionMenu, {
      props: {
        items: ITEMS,
        ariaLabel: 'Действия',
        colors: [{ id: 'yellow', label: 'жёлтый', color: '#fde68a' }],
        icons: [{ id: 'star', label: 'star' }],
      },
    });

    await fireEvent.pointerDown(screen.getByLabelText('Действия'), { button: 0 });

    // У палитр одинаковый фон и нет рамок, поэтому они стоят друг под другом
    // внутри одного блока без зазора: стык фонов не виден, блок читается единым.
    const color = screen.getByTestId('menu-color-picker');
    const icons = screen.getByTestId('menu-icon-picker');
    const group = color.parentElement;
    expect(group).toBe(icons.parentElement);
    expect(group?.className).not.toContain('gap-');
    expect(group?.className).toContain('bg-[var(--card)]');
    expect(color.className).toContain('bg-card');
  });
});
