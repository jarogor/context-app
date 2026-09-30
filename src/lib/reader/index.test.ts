import { describe, expect, it } from 'vitest';
import {
  UnsupportedFormatError,
  formatFromPath,
  isSupportedFormat,
  loadBookContent,
  loadWorkplaceViewer,
  readWorkplaceBook,
  selectWorkplacePlugin,
  supportedFormats,
  type ReaderBackend,
} from './index';

/** Мок-бэкенд с книгой заданного формата и содержимым. */
function backendFor(_format: string, content: unknown = {}): ReaderBackend {
  return {
    invoke: async (command) => {
      if (command === 'reader_content') {
        return content;
      }
      return {};
    },
  };
}

describe('formatFromPath', () => {
  it('берёт расширение файла как формат', () => {
    expect(formatFromPath('/books/Книга.epub')).toBe('epub');
    expect(formatFromPath('book.PDF')).toBe('pdf');
    expect(formatFromPath('без-расширения')).toBe('');
  });
});

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

    const content = await loadBookContent('/lib/book.epub', backend);

    expect(content.title).toBe('Книга');
    expect(content.authors).toEqual(['Автор']);
    expect(content.chapters).toHaveLength(1);
    expect(content.chapters[0].html).toBe('<p>текст</p>');
  });

  it('отвергает неподдерживаемый формат', async () => {
    const backend = backendFor('fb2');

    await expect(loadBookContent('/lib/book.fb2', backend)).rejects.toBeInstanceOf(
      UnsupportedFormatError,
    );
  });

  it('устойчив к пустому ответу', async () => {
    const backend = backendFor('epub');

    const content = await loadBookContent('/lib/book.epub', backend);

    expect(content.title).toBe('');
    expect(content.chapters).toEqual([]);
  });
});

/** Мок-бэкенд ядра для плагинов рабочего места. */
function workplaceBackend(overrides: Partial<Record<string, unknown>> = {}): ReaderBackend {
  return {
    invoke: async (command) => {
      if (command in overrides) {
        return overrides[command];
      }
      if (command === 'reader_formats') {
        return ['pdf'];
      }
      if (command === 'reader_plugin_for_format') {
        return 'plugin-1';
      }
      if (command === 'reader_viewer') {
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

  it('переживает недоступность плагинов', async () => {
    const backend = workplaceBackend({ reader_formats: [] });
    const formats = await supportedFormats(backend);
    expect(formats).toEqual(['epub']);
  });
});

describe('selectWorkplacePlugin', () => {
  it('выбирает плагин по формату файла', async () => {
    const backend: ReaderBackend = {
      invoke: async (command) => {
        if (command === 'reader_plugin_for_format') {
          return 'plugin-1';
        }
        return {};
      },
    };
    const selection = await selectWorkplacePlugin('/lib/book.pdf', backend);
    expect(selection).toEqual({ pluginId: 'plugin-1', format: 'pdf' });
  });

  it('возвращает null без плагина', async () => {
    const backend: ReaderBackend = {
      invoke: async (command) => {
        if (command === 'reader_plugin_for_format') {
          return null;
        }
        return {};
      },
    };
    expect(await selectWorkplacePlugin('/lib/book.pdf', backend)).toBeNull();
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
      invoke: async () => {
        call += 1;
        if (call === 1) {
          return { chunk: 'AAA', next: 3, total: 6, done: false };
        }
        return { chunk: 'BBB', next: 6, total: 6, done: true };
      },
    };
    const data = await readWorkplaceBook('/lib/book.demo', backend);
    expect(data).toBe('AAABBB');
    expect(call).toBe(2);
  });
});
