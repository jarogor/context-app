import { describe, expect, it } from 'vitest';

import {
  LIBRARY_COLORS,
  LIBRARY_COLOR_SWATCHES,
  LIBRARY_ICONS,
  libraryColorFill,
  libraryColorLine,
  normalizeLibraryColor,
  normalizeLibraryIcon,
  optionalLibraryText,
} from './library-appearance';
import { ACCENT_COLOR_SWATCHES, accentFill, accentLine } from '@context/ui';

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

  it('даёт заливку строки только для известного цвета', () => {
    expect(libraryColorFill(undefined)).toBeUndefined();
    expect(libraryColorFill('blue')).toContain('color-mix');
    // Выбранная строка заливается плотнее невыбранной.
    expect(libraryColorFill('blue', { selected: true })).not.toBe(libraryColorFill('blue'));
  });

  it('берёт заливку и обводку из общего реестра цветов', () => {
    // Библиотека и вкладка не подбирают оттенок порознь: расчёт один.
    expect(libraryColorFill('blue')).toBe(accentFill('blue', { strength: 'tint' }));
    expect(libraryColorLine('blue')).toBe(accentLine('blue'));
    expect(libraryColorLine(undefined)).toBeUndefined();
  });

  it('делает обводку записи приглушённой', () => {
    // Контур обозначает цвет записи, но не спорит с заливкой, текстом и выбором.
    expect(libraryColorLine('blue', { strong: false })).toBe(accentLine('blue', { strong: false }));
    expect(libraryColorLine('blue', { strong: false })).not.toBe(libraryColorLine('blue'));
  });

  it('предлагает общие с вкладками образцы иконок и цветов', () => {
    expect(LIBRARY_ICONS.length).toBeGreaterThan(0);
    expect(LIBRARY_COLORS).toContain('blue');
    expect(LIBRARY_COLOR_SWATCHES).toEqual(ACCENT_COLOR_SWATCHES);
  });
});
