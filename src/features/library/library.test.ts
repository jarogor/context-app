import { beforeEach, describe, expect, it, vi } from 'vitest';
import { absoluteBookPath, bookChoices } from './library';
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
