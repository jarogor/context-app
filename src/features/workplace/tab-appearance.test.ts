import { describe, expect, it } from 'vitest';
import { tabColorFill, tabLabel, tabTooltip } from './tab-appearance';

describe('вид вкладки', () => {
  it('показывает название книги, если имя не задано', () => {
    expect(tabLabel({ title: 'Книга' })).toBe('Книга');
    expect(tabLabel({ title: 'Книга', name: '   ' })).toBe('Книга');
  });

  it('пользовательское имя перекрывает название книги', () => {
    expect(tabLabel({ title: 'Книга', name: 'Черновик' })).toBe('Черновик');
  });

  it('даёт подсказку без описания равной подписи', () => {
    expect(tabTooltip({ title: 'Книга' })).toBe('Книга');
  });

  it('добавляет описание в подсказку отдельной строкой', () => {
    expect(tabTooltip({ title: 'Книга', name: 'Имя', description: 'сравнение' })).toBe(
      'Имя\nсравнение',
    );
  });

  it('возвращает заливку только для заданного цвета', () => {
    expect(tabColorFill(undefined)).toBeUndefined();
    expect(tabColorFill('blue')).toContain('#2563eb');
    expect(tabColorFill('blue')).toContain('color-mix');
  });

  it('делает заливку активной вкладки плотнее', () => {
    expect(Number(tabColorFill('blue', 'var(--card)', true)!.match(/(\d+)%/)![1])).toBeGreaterThan(
      Number(tabColorFill('blue', 'var(--card)', false)!.match(/(\d+)%/)![1]),
    );
  });
});
