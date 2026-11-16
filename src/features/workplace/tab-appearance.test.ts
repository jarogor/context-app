import { describe, expect, it } from 'vitest';
import { tabColorMark, tabLabel, tabTooltip } from './tab-appearance';
import { accentMark } from '@context/ui';

describe('вид вкладки', () => {
  it('показывает название книги, если имя не задано', () => {
    expect(tabLabel({ title: 'Книга' })).toBe('Книга');
    expect(tabLabel({ title: 'Книга', name: '   ' })).toBe('Книга');
  });

  it('пользовательское имя перекрывает название книги', () => {
    expect(tabLabel({ title: 'Книга', name: 'Черновик' })).toBe('Черновик');
  });

  it('даёт подсказку без описания равной названию книги', () => {
    expect(tabTooltip({ title: 'Книга' })).toBe('Книга');
  });

  it('в подсказке переименованной вкладки называет книгу в скобках', () => {
    // Имя вкладки перекрывает название книги, поэтому подсказка обязана назвать
    // книгу: иначе по вкладке нельзя понять, что за книга открыта.
    expect(tabTooltip({ title: 'Книга', name: 'Имя' })).toBe('Имя (Книга)');
  });

  it('не добавляет описание в подсказку', () => {
    const tab = { title: 'Книга', name: 'Имя', description: 'сравнение' };
    expect(tabTooltip(tab)).toBe('Имя (Книга)');
  });

  it('даёт цвет метки только для заданного цвета', () => {
    expect(tabColorMark(undefined)).toBeUndefined();
    // Метка — пара «заливка и подпись», а не один цвет: так она читается.
    expect(tabColorMark('blue')?.fill).toContain('var(--accent-mark-blue');
    expect(tabColorMark('blue')?.ink).toContain('var(--accent-mark-blue-ink');
  });

  it('берёт цвет метки из общего реестра, а не подбирает оттенок на месте', () => {
    // Метка и кнопка меню библиотеки окрашены одной парой: разойдясь, они
    // показывали бы «синюю» вкладку и «синюю» библиотеку разными цветами.
    expect(tabColorMark('blue')).toEqual(accentMark('blue'));
  });
});
