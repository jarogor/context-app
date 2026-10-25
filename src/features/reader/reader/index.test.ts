import { describe, expect, it } from 'vitest';
import {
  UnsupportedFormatError,
  formatFromPath,
  isSupportedFormat,
  loadBookContent,
  loadWorkplaceBundle,
  loadWorkplaceViewer,
  readWorkplaceBook,
  selectWorkplacePlugin,
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

  it('поддерживает FB2 как текстовый формат', () => {
    expect(isSupportedFormat('fb2')).toBe(true);
    expect(isSupportedFormat('FB2')).toBe(true);
  });

  it('не поддерживает другие форматы', () => {
    expect(isSupportedFormat('docx')).toBe(false);
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
    const backend = backendFor('docx');

    await expect(loadBookContent('/lib/book.docx', backend)).rejects.toBeInstanceOf(
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
    invoke: async (command, payload) => {
      if (command in overrides) {
        const value = overrides[command];
        return typeof value === 'function' ? (value as (input: unknown) => unknown)(payload) : value;
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

describe('loadWorkplaceBundle', () => {
  it('собирает точку входа и файлы модуля', async () => {
    const backend = workplaceBackend({
      reader_viewer: '<html><script src="pdf.mjs"></script></html>',
      reader_viewer_files: [
        { path: 'index.html', mime: 'text/html' },
        { path: 'pdf.mjs', mime: 'text/javascript' },
      ],
      reader_viewer_file: (payload: unknown) => {
        const path = (payload as { path?: string }).path ?? '';
        return { path, data: `data:${path}` };
      },
    });
    const bundle = await loadWorkplaceBundle('plugin-1', backend);
    expect(bundle.entry).toContain('pdf.mjs');
    expect(bundle.files.map((file) => file.path)).toEqual(['index.html', 'pdf.mjs']);
    expect(bundle.files[1].base64).toBe('data:pdf.mjs');
    expect(bundle.files[1].mime).toBe('text/javascript');
  });

  it('переживает отсутствие списка файлов', async () => {
    const backend = workplaceBackend({ reader_viewer_files: null });
    const bundle = await loadWorkplaceBundle('plugin-1', backend);
    expect(bundle.files).toEqual([]);
  });
});

describe('readWorkplaceBook', () => {
  it('собирает книгу склейкой порций и не перекодирует её', async () => {
    // Порции выровнены по base64 и приходят без паддинга: содержимое собирается
    // конкатенацией строк. Прежняя реализация декодировала каждую порцию
    // (`atob`) и кодировала всю книгу обратно (`btoa`) на главном потоке — на
    // большой книге это замораживало интерфейс.
    const first = btoa(String.fromCharCode(0, 1, 2));
    const second = btoa(String.fromCharCode(3, 4, 5));
    const last = btoa(String.fromCharCode(6, 7));
    const chunks = [first, second, last];
    let call = 0;
    const backend: ReaderBackend = {
      invoke: async () => {
        const chunk = chunks[call];
        call += 1;
        const done = call === chunks.length;
        return {
          chunk,
          next: call * 3,
          total: 8,
          done,
        };
      },
    };
    const data = await readWorkplaceBook('/lib/book.demo', backend);
    // Склейка ровно тех строк, что пришли: без промежуточного декодирования.
    expect(data).toBe(first + second + last);
    expect(atob(data)).toBe(String.fromCharCode(0, 1, 2, 3, 4, 5, 6, 7));
    expect(call).toBe(3);
  });

  it('просит порции, выровненные по границе base64', async () => {
    const lengths: number[] = [];
    const backend: ReaderBackend = {
      invoke: async (_command, payload) => {
        const request = payload as { length: number };
        lengths.push(request.length);
        return { chunk: '', next: 1, total: 1, done: true };
      },
    };
    await readWorkplaceBook('/lib/book.demo', backend);
    // Длина кратна трём: промежуточные порции выходят без паддинга.
    expect(lengths[0] % 3).toBe(0);
  });
});
