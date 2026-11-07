import { describe, expect, it, vi } from 'vitest';

import { applyBookProperties, loadBookProperties, saveBookProperties } from './book-properties';
import type { Book } from './library';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
}));

import { invokeCommand } from '../../shared/app-bridge';

const invoke = vi.mocked(invokeCommand);

/** Книга источника. */
function book(overrides: Partial<Book> = {}): Book {
  return {
    id: 'a',
    title: 'Старое название',
    authors: [{ name: 'Автор' }],
    series: [],
    tags: [{ name: 'тег' }],
    files: [{ kind: 'book', path: 'a.epub', format: 'epub' }],
    language: 'ru',
    ...overrides,
  };
}

describe('пользовательские свойства книг', () => {
  it('читает правки ядра и отбрасывает пустые записи', async () => {
    invoke.mockResolvedValue({
      '/lib/a.epub': {
        title: 'Новое название',
        authors: ['Автор'],
        tags: ['для диссертации'],
        updated_at_millis: 5,
      },
      '/lib/b.epub': { title: '   ' },
    });

    const properties = await loadBookProperties();

    expect(properties).toEqual({
      '/lib/a.epub': {
        title: 'Новое название',
        authors: ['Автор'],
        tags: ['для диссертации'],
        updatedAtMillis: 5,
      },
    });
  });

  it('сохраняет правку и возвращает обновлённый набор', async () => {
    invoke.mockResolvedValue({ '/lib/a.epub': { title: 'Новое' } });

    const properties = await saveBookProperties('/lib/a.epub', { title: 'Новое' });

    expect(invoke).toHaveBeenCalledWith('book_properties_set', {
      path: '/lib/a.epub',
      properties: { title: 'Новое' },
    });
    expect(properties['/lib/a.epub'].title).toBe('Новое');
  });

  it('накладывает правку поверх источника, не затирая теги файла', () => {
    const merged = applyBookProperties(
      [book()],
      { '/lib/a.epub': { title: 'Новое название', authors: ['Пётр'], tags: ['мой тег'] } },
      () => '/lib/a.epub',
    );

    expect(merged[0].title).toBe('Новое название');
    expect(merged[0].authors).toEqual([{ name: 'Пётр' }]);
    expect(merged[0].userTags).toEqual(['мой тег']);
    expect(merged[0].tags).toEqual([{ name: 'тег' }]);
    expect(merged[0].language).toBe('ru');
  });

  it('без правки оставляет книгу как есть', () => {
    const merged = applyBookProperties([book()], {}, () => '/lib/a.epub');

    expect(merged[0]).toEqual(book());
    expect(merged[0].userTags).toBeUndefined();
  });
});
