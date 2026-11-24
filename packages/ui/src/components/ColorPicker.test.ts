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

/** Фигура цвета внутри образца. */
function figure(id: string): HTMLElement {
  return screen.getByTestId(`color-${id}`).firstElementChild as HTMLElement;
}

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
    // Ширина фиксирована числом в долях шкалы: блок не растёт при наведении на
    // образец, но растёт вместе со шкалой интерфейса на широких мониторах.
    expect(picker.style.width).toContain('calc(var(--spacing)');
  });

  it('складывает ширину блока из слотов, зазоров и отступов', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    const picker = screen.getByTestId('color-picker');
    const width = Number.parseFloat(picker.style.width.match(/\*\s*([\d.]+)/)?.[1] ?? '0');
    // Три слота по 5 долей шкалы, два зазора по 1 и боковые отступы 4.
    expect(width).toBe(3 * 5 + 2 * 1 + 4);
  });

  it('даёт каждому образцу слот фиксированного размера', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    // Слот не зависит от наведения и выбора: иначе соседи переставлялись бы.
    for (const color of COLORS) {
      const slot = screen.getByTestId(`color-${color.id}`);
      expect(slot.className).toContain('size-5');
      expect(slot.className).not.toContain('grow');
      expect(slot.className).not.toContain('flex-1');
    }
  });

  it('рисует невыбранный цвет кругом, который при наведении заполняет слот', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    const shape = figure('green');
    expect(shape.className).toContain('rounded-full');
    expect(shape.className).toContain('size-[60%]');
    // Наведение даёт самый крупный размер — тот же, что у выбранного.
    expect(shape.className).toContain('group-hover:size-full');
    expect(shape.className).not.toContain('group-hover:size-[80%]');
  });

  it('берёт фон палитры из самой светлой ступени палитры', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    const picker = screen.getByTestId('color-picker');
    // Не `--control-surface` (фон страницы): на нём светлые оттенки сливались.
    expect(picker.className).toContain('bg-[var(--picker-surface)]');
    expect(picker.className).not.toContain('bg-[var(--control-surface)]');
  });

  it('делает выбранный цвет квадратом с закруглёнными углами', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    const shape = figure('yellow');
    expect(shape.className).toContain('rounded-[0.25rem]');
    expect(shape.className).toContain('size-full');
    expect(shape.className).not.toContain('rounded-full');
  });

  it('имеет высоту базового контрола, чтобы стоять вровень с кнопками', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    const picker = screen.getByTestId('color-picker');
    // Та же высота, что у кнопок, полей и списков базового размера (`h-9`).
    expect(picker.className).toContain('h-9');
  });

  it('не рисует собственную обводку: палитра стоит внутри меню и слоя', () => {
    render(ColorPicker, { props: { colors: COLORS, onpick: vi.fn() } });

    const picker = screen.getByTestId('color-picker');
    // Контур спорил бы с обводкой всплывающего меню, внутри которого палитра живёт.
    expect(picker.className).not.toContain('border');
  });
});
