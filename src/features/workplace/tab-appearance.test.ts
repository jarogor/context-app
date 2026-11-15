import { describe, expect, it } from 'vitest';
import { tabColorFill, tabIdleFill, tabLabel, tabTooltip } from './tab-appearance';

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

  it('возвращает заливку только для заданного цвета', () => {
    expect(tabColorFill(undefined)).toBeUndefined();
    expect(tabColorFill('blue')).toContain('var(--accent-fill-blue-soft');
    expect(tabColorFill('blue')).not.toContain('color-mix');
  });

  it('берёт для неактивной вкладки тихую ступень цвета', () => {
    // Неактивная вкладка — тихая ступень: цвет читается оттенком, а не
    // плотной заливкой, поэтому не спорит с активной.
    expect(tabIdleFill('blue')).toContain('var(--accent-fill-blue-tint');
    expect(tabIdleFill(undefined)).toBeUndefined();
  });

  it('делает активную цветную вкладку заметно плотнее неактивной', () => {
    // Активная заливается плотной ступенью, неактивная — тихой: разницу
    // задаёт общий реестр цветов, а не число на месте.
    expect(tabColorFill('blue', true)).toContain('var(--accent-fill-blue-active');
    expect(tabIdleFill('blue')).toContain('var(--accent-fill-blue-tint');
  });
});
