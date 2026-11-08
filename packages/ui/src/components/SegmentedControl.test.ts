// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SegmentedControl from './SegmentedControl.svelte';
import type { SegmentedItem } from './SegmentedControl.svelte';

/** Набор вариантов для проверок. */
const ITEMS: SegmentedItem[] = [
  { value: 'grid', label: 'Плитка', icon: 'grid' },
  { value: 'list', label: 'Список', icon: 'list' },
];

describe('SegmentedControl', () => {
  it('передаёт выбранный вариант в обработчик', async () => {
    const onchange = vi.fn();
    render(SegmentedControl, {
      props: { items: ITEMS, value: 'grid', ariaLabel: 'Режим', onchange },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Список' }));

    expect(onchange).toHaveBeenCalledWith('list');
  });

  it('помечает выбранный вариант нажатым', () => {
    render(SegmentedControl, {
      props: { items: ITEMS, value: 'list', ariaLabel: 'Режим', onchange: vi.fn() },
    });

    expect(screen.getByRole('button', { name: 'Плитка' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Список' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('имеет высоту базового контрола, как у кнопок, полей и списков', () => {
    render(SegmentedControl, {
      props: { items: ITEMS, value: 'grid', ariaLabel: 'Режим', onchange: vi.fn() },
    });

    const group = screen.getByRole('group');
    // Та же высота, что у кнопок, полей и списков базового размера (`h-9`).
    expect(group.className).toContain('h-9');

    // Внутренняя кнопка укладывается в высоту блока вместе с рамкой и отступом,
    // а её иконка и скругление уменьшены пропорционально, а не оставлены базовыми.
    const button = screen.getByRole('button', { name: 'Плитка' });
    expect(button.className).toContain('size-[1.875rem]');
    expect(button.className).toContain('rounded-[calc(var(--radius)-0.125rem)]');
    expect(button.className).toContain('[&_svg]:size-[0.9375em]');
    expect(button.className).toContain('pointer-coarse:size-[2.375rem]');
  });
});
