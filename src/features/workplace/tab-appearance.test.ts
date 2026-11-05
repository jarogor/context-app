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
    expect(tabColorFill('blue')).toContain('#2563eb');
    expect(tabColorFill('blue')).toContain('color-mix');
  });

  it('смешивает цвет неактивной вкладки с фоном неактивной вкладки', () => {
    // Основа фона неактивной цветной вкладки — общий фон неактивной вкладки, а
    // не полоса и не карточка: цветная и нецветная отличаются лишь оттенком.
    expect(tabIdleFill('blue')).toContain('var(--tab-idle-surface)');
    expect(tabIdleFill('blue')).toContain('#2563eb 7%');
    expect(tabIdleFill(undefined)).toBeUndefined();
  });

  it('делает активную цветную вкладку заметно плотнее неактивной', () => {
    // Активная залита цветом заметно плотнее неактивной, чтобы читаться сразу.
    expect(tabColorFill('blue', 'var(--card)', true)).toContain('#2563eb 40%');
    expect(tabIdleFill('blue')).toContain('#2563eb 7%');
  });
});
