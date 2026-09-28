import { describe, expect, it } from 'vitest';
import {
  UnsupportedFormatError,
  isSupportedFormat,
  loadBookContent,
  type ReaderBackend,
} from './index';

/** Мок-бэкенд с книгой заданного формата и содержимым. */
function backendFor(format: string, content: unknown = {}): ReaderBackend {
  return {
    storageRoot: 'state',
    invoke: async (_command, payload) => {
      const message = (payload ?? {}) as { operation?: string };
      if (message.operation === 'list') {
        return {
          catalog: { books: [{ id: 'book-1', files: [{ kind: 'book', format }] }] },
        };
      }
      if (message.operation === 'content') {
        return content;
      }
      return {};
    },
  };
}

describe('isSupportedFormat', () => {
  it('поддерживает EPUB', () => {
    expect(isSupportedFormat('epub')).toBe(true);
    expect(isSupportedFormat('EPUB')).toBe(true);
  });

  it('не поддерживает другие форматы', () => {
    expect(isSupportedFormat('fb2')).toBe(false);
    expect(isSupportedFormat('')).toBe(false);
  });
});

describe('loadBookContent', () => {
  it('возвращает нормализованное содержимое EPUB', async () => {
    const backend = backendFor('epub', {
      title: 'Книга',
      authors: ['Автор'],
      chapters: [{ title: 'Глава', html: '<p>текст</p>' }],
    });

    const content = await loadBookContent('book-1', backend);

    expect(content.title).toBe('Книга');
    expect(content.authors).toEqual(['Автор']);
    expect(content.chapters).toHaveLength(1);
    expect(content.chapters[0].html).toBe('<p>текст</p>');
  });

  it('отвергает неподдерживаемый формат', async () => {
    const backend = backendFor('fb2');

    await expect(loadBookContent('book-1', backend)).rejects.toBeInstanceOf(
      UnsupportedFormatError,
    );
  });

  it('устойчив к пустому ответу', async () => {
    const backend = backendFor('epub');

    const content = await loadBookContent('book-1', backend);

    expect(content.title).toBe('');
    expect(content.chapters).toEqual([]);
  });
});
