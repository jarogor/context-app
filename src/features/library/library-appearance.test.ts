import { describe, expect, it } from 'vitest';

import {
  LIBRARY_COLORS,
  LIBRARY_COLOR_SWATCHES,
  LIBRARY_ICONS,
  libraryColorFill,
  libraryColorMark,
  normalizeLibraryColor,
  normalizeLibraryIcon,
  optionalLibraryText,
} from './library-appearance';
import { ACCENT_COLOR_SWATCHES, accentFill, accentMark } from '@context/ui';

describe('оформление библиотеки', () => {
  it('отбрасывает неизвестные иконку и цвет', () => {
    expect(normalizeLibraryIcon('star')).toBe('star');
    expect(normalizeLibraryIcon('not-an-icon')).toBeUndefined();
    expect(normalizeLibraryColor('blue')).toBe('blue');
    expect(normalizeLibraryColor('black')).toBeUndefined();
  });

  it('читает пустой текст как «не задано»', () => {
    expect(optionalLibraryText('  Домашняя ')).toBe('Домашняя');
    expect(optionalLibraryText('   ')).toBeUndefined();
    expect(optionalLibraryText(null)).toBeUndefined();
  });

  it('даёт заливку шапки карточки только для известного цвета', () => {
    expect(libraryColorFill(undefined)).toBeUndefined();
    expect(libraryColorFill('blue')).toContain('var(--accent-fill-blue-tint');
    // Шапка выбранной карточки заливается плотной ступенью, обычная — тихой.
    expect(libraryColorFill('blue', { selected: true })).toContain('var(--accent-fill-blue-active');
  });

  it('берёт заливку из общего реестра цветов', () => {
    // Библиотека и вкладка не подбирают оттенок порознь: расчёт один.
    expect(libraryColorFill('blue')).toBe(accentFill('blue', { strength: 'tint' }));
  });

  it('даёт знак строки тем же цветом, что и вкладку', () => {
    // Строки списка одинаковы, а цвет библиотеки показывает кнопка меню; она
    // обязана совпадать с меткой вкладки того же цвета.
    expect(libraryColorMark(undefined)).toBeUndefined();
    expect(libraryColorMark('blue')).toEqual(accentMark('blue'));
  });

  it('предлагает общие с вкладками образцы иконок и цветов', () => {
    expect(LIBRARY_ICONS.length).toBeGreaterThan(0);
    expect(LIBRARY_COLORS).toContain('blue');
    expect(LIBRARY_COLOR_SWATCHES).toEqual(ACCENT_COLOR_SWATCHES);
  });
});
