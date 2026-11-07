import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  absoluteBookPath,
  bookChoices,
  formatPublishedDate,
  listBooks,
  openBookFolder,
} from './library';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
}));

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
  invoke.mockReset();
});

describe('абсолютный путь книги', () => {
  it('собирается из корня библиотеки и относительного пути', () => {
    expect(absoluteBookPath('/lib', 'Автор/Книга.epub')).toBe('/lib/Автор/Книга.epub');
    expect(absoluteBookPath('/lib/', 'Книга.epub')).toBe('/lib/Книга.epub');
  });

  it('оставляет абсолютный путь как есть', () => {
    expect(absoluteBookPath('/lib', '/home/me/Книга.epub')).toBe('/home/me/Книга.epub');
    expect(absoluteBookPath('', 'C:\\Книги\\Книга.fb2')).toBe('C:\\Книги\\Книга.fb2');
  });

  it('возвращает пустую строку без пути файла', () => {
    expect(absoluteBookPath('/lib', '  ')).toBe('');
  });
});

describe('книги для выбора', () => {
  it('собирает ключ, имя файла и название из каталога библиотеки', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'active_library') {
        return { path: '/lib' };
      }
      return {
        catalog: {
          books: [
            {
              id: 'demo-1',
              title: 'Демо-книга',
              files: [{ kind: 'book', path: 'Автор/Демо.epub', format: 'epub' }],
            },
            {
              id: 'cover-only',
              title: 'Без файла',
              files: [{ kind: 'cover', path: 'cover.jpg', format: 'jpg' }],
            },
          ],
        },
      };
    });

    await expect(bookChoices()).resolves.toEqual([
      { key: '/lib/Автор/Демо.epub', name: 'Демо.epub', title: 'Демо-книга' },
    ]);
  });

  it('не требует активной библиотеки, если книга открыта абсолютным путём', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'active_library') {
        return null;
      }
      return {
        catalog: {
          books: [
            {
              id: 'b',
              title: 'Книга',
              files: [{ kind: 'book', path: '/tmp/a.epub', format: 'epub' }],
            },
          ],
        },
      };
    });

    await expect(bookChoices()).resolves.toEqual([
      { key: '/tmp/a.epub', name: 'a.epub', title: 'Книга' },
    ]);
  });
});

describe('разбор книги каталога', () => {
  it('читает свойства книги из ответа источника', async () => {
    invoke.mockResolvedValue({
      catalog: {
        books: [
          {
            id: 'a',
            title: 'Книга',
            authors: ['Автор'],
            tags: ['тег'],
            series: [['Серия', 1]],
            files: [{ kind: 'book', path: 'a.epub', format: 'epub' }],
            language: 'ru',
            published: '2019-05-01',
            publisher: 'Издатель',
            description: 'Описание',
            identifier: 'urn:isbn:978-5-00000-000-0',
            size: 2048,
            added_at_ms: 1000,
          },
        ],
      },
    });

    const [book] = await listBooks('');

    expect(book).toMatchObject({
      language: 'ru',
      published: '2019-05-01',
      publisher: 'Издатель',
      description: 'Описание',
      identifier: 'urn:isbn:978-5-00000-000-0',
      size: 2048,
      addedAtMillis: 1000,
    });
    expect(book.tags).toEqual([{ name: 'тег' }]);
    expect(book.series).toEqual([{ series: { name: 'Серия' } }]);
  });

  it('не падает на ответе прежнего источника без новых полей', async () => {
    invoke.mockResolvedValue({
      catalog: { books: [{ id: 'a', title: 'Книга', files: [] }] },
    });

    const [book] = await listBooks('');

    expect(book.language).toBeUndefined();
    expect(book.published).toBeUndefined();
    expect(book.size).toBeUndefined();
    expect(book.addedAtMillis).toBeUndefined();
  });
});

describe('дата выхода', () => {
  it('оставляет от полной даты ISO только дату', () => {
    expect(formatPublishedDate('2019-05-01T00:00:00+00:00')).toBe('2019-05-01');
    expect(formatPublishedDate('2001')).toBe('2001');
    expect(formatPublishedDate('  2019-05-01 ')).toBe('2019-05-01');
    expect(formatPublishedDate(undefined)).toBe('');
  });
});

describe('папка книги', () => {
  it('открывает папку с файлом', async () => {
    await openBookFolder('/lib/Автор/Книга.epub');

    expect(invoke).toHaveBeenCalledWith('open_folder', { path: '/lib/Автор' });
  });
});
