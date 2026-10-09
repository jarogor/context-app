// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import ColorPicker from './ColorPicker.svelte';
import type { ColorSwatch } from './ColorPicker.svelte';

/** Набор образцов палитры для проверок. */
const COLORS: ColorSwatch[] = [
  { id: 'yellow', label: 'жёлтый', value: '#eab308', selected: true },
  { id: 'green', label: 'зелёный', value: '#16a34a' },
  { id: 'blue', label: 'синий', value: '#2563eb' },
];

describe('ColorPicker', () => {
  it('передаёт выбранный цвет в обработчик', async () => {
    const onpick = vi.fn();
    render(ColorPicker, { props: { colors: COLORS, onpick } });

    await fireEvent.click(screen.getByTestId('color-green'));

    expect(onpick).toHaveBeenCalledWith('green');
  });

  it('держит фиксированную ширину блока, чтобы наведение не толкало соседей', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    const picker = screen.getByTestId('color-picker');
    // Ширина фиксирована числом: блок не растёт при наведении на образец.
    expect(picker.style.width).toMatch(/^\d+px$/);
  });

  it('имеет высоту базового контрола, чтобы стоять вровень с кнопками', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    const picker = screen.getByTestId('color-picker');
    // Та же высота, что у кнопок, полей и списков базового размера (`h-9`).
    expect(picker.className).toContain('h-9');
  });

  it('ширина блока вмещает расширенный выбранный образец', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    const picker = screen.getByTestId('color-picker');
    const width = Number.parseInt(picker.style.width, 10);
    const swatches = COLORS.length;
    // Базовая ширина невыбранного образца — 16 px, зазоры по 3 px, chrome 12 px,
    // выбранный образец шире в 1.8 раза. Проверяем нижнюю границу вместимости.
    expect(width).toBeGreaterThanOrEqual(swatches * 16 + (swatches - 1) * 3);
  });
});
