// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import IconPicker from './IconPicker.svelte';
import type { IconSwatch } from './IconPicker.svelte';

/** Набор образцов иконок для проверок. */
const ICONS: IconSwatch[] = [
  { id: 'star', label: 'star', selected: true },
  { id: 'bookmark', label: 'bookmark' },
  { id: 'flag', label: 'flag' },
];

describe('IconPicker', () => {
  it('передаёт выбранную иконку в обработчик', async () => {
    const onpick = vi.fn();
    render(IconPicker, { props: { icons: ICONS, onpick } });

    await fireEvent.click(screen.getByTestId('icon-bookmark'));

    expect(onpick).toHaveBeenCalledWith('bookmark');
  });

  it('отмечает выбранную иконку', () => {
    render(IconPicker, { props: { icons: ICONS, onpick: vi.fn() } });

    expect(screen.getByTestId('icon-star').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('icon-flag').getAttribute('aria-pressed')).toBe('false');
  });

  it('не рисует собственную обводку: сетка стоит внутри меню и слоя', () => {
    render(IconPicker, { props: { icons: ICONS, onpick: vi.fn() } });

    const picker = screen.getByTestId('icon-picker');
    // Контур спорил бы с обводкой всплывающего меню, внутри которого сетка живёт.
    expect(picker.className).not.toContain('border');
  });
});
