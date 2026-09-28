import { describe, expect, it } from 'vitest';
import {
  UnsupportedFormatError,
  bookFormat,
  isSupportedFormat,
  loadBookContent,
  loadWorkplaceViewer,
  readWorkplaceBook,
  selectWorkplacePlugin,
  supportedFormats,
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

/** Мок-бэкенд ядра для плагинов рабочего места. */
function workplaceBackend(overrides: Partial<Record<string, unknown>> = {}): ReaderBackend {
  return {
    storageRoot: 'state',
    invoke: async (command, _payload) => {
      if (command in overrides) {
        return overrides[command];
      }
      if (command === 'workplace_formats') {
        return ['pdf'];
      }
      if (command === 'workplace_plugin_for_format') {
        return 'plugin-1';
      }
      if (command === 'workplace_viewer') {
        return '<html></html>';
      }
      return {};
    },
  };
}

describe('supportedFormats', () => {
  it('добавляет форматы плагинов рабочего места к встроенным', async () => {
    const formats = await supportedFormats(workplaceBackend());
    expect(formats).toContain('epub');
    expect(formats).toContain('pdf');
  });

  it('переживает недоступность сессии', async () => {
    const backend = workplaceBackend({ workplace_formats: [] });
    const formats = await supportedFormats(backend);
    expect(formats).toEqual(['epub']);
  });
});

describe('selectWorkplacePlugin', () => {
  it('выбирает плагин по формату книги', async () => {
    const backend: ReaderBackend = {
      storageRoot: 'state',
      invoke: async (command) => {
        if (command === 'workplace_plugin_for_format') {
          return 'plugin-1';
        }
        return { catalog: { books: [{ id: 'book-1', files: [{ kind: 'book', format: 'pdf' }] }] } };
      },
    };
    const selection = await selectWorkplacePlugin('book-1', backend);
    expect(selection).toEqual({ pluginId: 'plugin-1', format: 'pdf' });
  });

  it('возвращает null без плагина', async () => {
    const backend: ReaderBackend = {
      storageRoot: 'state',
      invoke: async (command) => {
        if (command === 'workplace_plugin_for_format') {
          return null;
        }
        return { catalog: { books: [{ id: 'book-1', files: [{ kind: 'book', format: 'pdf' }] }] } };
      },
    };
    expect(await selectWorkplacePlugin('book-1', backend)).toBeNull();
  });
});

describe('loadWorkplaceViewer', () => {
  it('возвращает модуль рисования', async () => {
    const html = await loadWorkplaceViewer('plugin-1', workplaceBackend());
    expect(html).toBe('<html></html>');
  });
});

describe('readWorkplaceBook', () => {
  it('собирает содержимое из порций', async () => {
    let call = 0;
    const backend: ReaderBackend = {
      storageRoot: 'state',
      invoke: async () => {
        call += 1;
        if (call === 1) {
          return { chunk: 'AAA', next: 3, total: 6, done: false };
        }
        return { chunk: 'BBB', next: 6, total: 6, done: true };
      },
    };
    const data = await readWorkplaceBook('book-1', backend);
    expect(data).toBe('AAABBB');
    expect(call).toBe(2);
  });
});

describe('bookFormat', () => {
  it('определяет формат по каталогу', async () => {
    expect(await bookFormat('book-1', backendFor('pdf'))).toBe('pdf');
  });
});
