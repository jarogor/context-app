import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeNoteSetImport,
  exportNoteSet,
  bindNoteSetBook,
  pickBookFile,
  prepareNoteSetImport,
} from './io';
import { invokeCommand, openDialog } from '../../shared/app-bridge';
import { basePluginOperation } from '../../shared/base-plugin';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
  openDialog: vi.fn(),
}));

vi.mock('../../shared/base-plugin', () => ({
  basePluginOperation: vi.fn(),
}));

const invoke = vi.mocked(invokeCommand);
const dialog = vi.mocked(openDialog);
const plugin = vi.mocked(basePluginOperation);

beforeEach(() => {
  invoke.mockReset();
  dialog.mockReset();
  plugin.mockReset();
});

describe('экспорт набора заметок', () => {
  it('сохраняет текст плагина под предложенным именем файла', async () => {
    plugin.mockResolvedValue({ file_name: 'Основные.notes.json', document: '{"set":{}}' });
    invoke.mockResolvedValue('/tmp/Основные.notes.json');

    await expect(exportNoteSet('ns-1', 'Книга.epub')).resolves.toBe('/tmp/Основные.notes.json');

    // Имя файла книги уходит в документ: по нему набор найдёт книгу на другой стороне.
    expect(plugin).toHaveBeenCalledWith('notes.store@1', 'export_set', {
      set_id: 'ns-1',
      book_name: 'Книга.epub',
    });
    expect(invoke).toHaveBeenCalledWith('save_text_file', {
      fileName: 'Основные.notes.json',
      content: '{"set":{}}',
    });
  });

  it('передаёт пустой документ, если плагин его не прислал', async () => {
    plugin.mockResolvedValue({});
    invoke.mockResolvedValue(null);

    await expect(exportNoteSet('ns-1', 'Книга.epub')).resolves.toBeNull();

    expect(invoke).toHaveBeenCalledWith('save_text_file', {
      fileName: 'notes.json',
      content: '',
    });
  });
});

describe('подготовка импорта набора', () => {
  it('читает описание файла, не меняя хранилище', async () => {
    dialog.mockResolvedValue('/tmp/Чужая книга.notes.json');
    plugin.mockResolvedValue({
      set: { name: 'Поделились', note_count: 2 },
      book: { name: 'Чужая книга.epub', title: 'Чужая книга' },
    });

    const pending = await prepareNoteSetImport();

    expect(dialog).toHaveBeenCalledTimes(1);
    expect(plugin).toHaveBeenCalledWith('notes.store@1', 'inspect_import', {
      path: '/tmp/Чужая книга.notes.json',
    });
    expect(pending).toEqual({
      path: '/tmp/Чужая книга.notes.json',
      name: 'Поделились',
      noteCount: 2,
      book: { name: 'Чужая книга.epub', title: 'Чужая книга' },
    });
  });

  it('не трогает плагин, если файл не выбран', async () => {
    dialog.mockResolvedValue(null);

    await expect(prepareNoteSetImport()).resolves.toBeNull();

    expect(plugin).not.toHaveBeenCalled();
  });

  it('не трогает плагин при пустом пути', async () => {
    dialog.mockResolvedValue('');

    await expect(prepareNoteSetImport()).resolves.toBeNull();

    expect(plugin).not.toHaveBeenCalled();
  });
});

describe('принятие набора', () => {
  const pending = {
    path: '/tmp/Чужая книга.notes.json',
    name: 'Поделились',
    noteCount: 1,
    book: { name: 'Чужая книга.epub', title: 'Чужая книга' },
  };

  it('принимает набор без книги: его можно посмотреть и найти', async () => {
    plugin.mockResolvedValue({
      set: { id: 'ns-9', book_key: '', book_title: 'Чужая книга', name: 'Поделились', notes: [] },
    });

    const set = await completeNoteSetImport(pending);

    expect(plugin).toHaveBeenCalledWith('notes.store@1', 'import_set', {
      path: '/tmp/Чужая книга.notes.json',
      book_key: '',
      book_title: '',
    });
    expect(set.id).toBe('ns-9');
    expect(set.bookKey).toBe('');
  });

  it('принимает набор сразу с указанной книгой', async () => {
    plugin.mockResolvedValue({
      set: { id: 'ns-9', book_key: '/lib/Книга.epub', name: 'Поделились', notes: [] },
    });

    await completeNoteSetImport(pending, { key: '/lib/Книга.epub', title: 'Книга' });

    expect(plugin).toHaveBeenCalledWith('notes.store@1', 'import_set', {
      path: '/tmp/Чужая книга.notes.json',
      book_key: '/lib/Книга.epub',
      book_title: 'Книга',
    });
  });
});

describe('книга набора', () => {
  it('указывает файл книги в форматах, которые умеет читать приложение', async () => {
    invoke.mockResolvedValue(['epub', 'FB2', '.pdf']);
    dialog.mockResolvedValue('/моя/библиотека/Книга.fb2');

    await expect(pickBookFile()).resolves.toEqual({ key: '/моя/библиотека/Книга.fb2', title: '' });

    expect(dialog).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'Книги', extensions: ['epub', 'fb2', 'pdf'] }],
    });
  });

  it('возвращает null, если файл книги не выбран', async () => {
    invoke.mockResolvedValue(['epub']);
    dialog.mockResolvedValue(null);

    await expect(pickBookFile()).resolves.toBeNull();
  });

  it('привязывает существующий набор к книге', async () => {
    plugin.mockResolvedValue({
      set: {
        id: 'ns-9',
        book_key: '/моя/книга.epub',
        book_title: 'Моя книга',
        name: 'Поделились',
        notes: [],
      },
    });

    const set = await bindNoteSetBook('ns-9', { key: '/моя/книга.epub', title: 'Моя книга' });

    expect(plugin).toHaveBeenCalledWith('notes.store@1', 'bind_set', {
      set_id: 'ns-9',
      book_key: '/моя/книга.epub',
      book_title: 'Моя книга',
    });
    expect(set.bookKey).toBe('/моя/книга.epub');
  });
});
