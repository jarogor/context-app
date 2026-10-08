import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_TOOL, type NoteTool } from '../notes/notes';
import {
  buildReaderThemeMessage,
  isWorkplaceMessage,
  parseViewerMessage,
  WORKPLACE_CHANNEL,
} from './workplace-protocol';
import { readerPageColors, readerThemeNoteTones, readerThemeTokens } from '@texture/ui';

/** Активный инструмент страничного формата для значений по умолчанию. */
const TOOL: NoteTool = { ...DEFAULT_NOTE_TOOL, type: 'shape', shape: 'ellipse', color: 'blue' };

/** Сообщение области содержимого с произвольным телом. */
function message(type: string, value?: unknown, extra: Record<string, unknown> = {}) {
  return { channel: WORKPLACE_CHANNEL, type, value, ...extra };
}

describe('протокол рабочего места: источник и канал', () => {
  it('принимает сообщение только от области содержимого', () => {
    const source = {} as Window;
    expect(isWorkplaceMessage({ source, data: message('ready') } as MessageEvent, source)).toBe(
      true,
    );
    expect(
      isWorkplaceMessage({ source: {} as Window, data: message('ready') } as MessageEvent, source),
    ).toBe(false);
  });

  it('отклоняет сообщение чужого канала', () => {
    const source = {} as Window;
    const event = { source, data: { channel: 'other', type: 'ready' } } as MessageEvent;
    expect(isWorkplaceMessage(event, source)).toBe(false);
  });
});

describe('протокол рабочего места: разбор сообщений', () => {
  it('понимает служебные события без значения', () => {
    expect(parseViewerMessage(message('ready'), TOOL)).toEqual({ type: 'ready' });
    expect(parseViewerMessage(message('selection-cleared'), TOOL)).toEqual({
      type: 'selection-cleared',
    });
    expect(parseViewerMessage(message('note-menu-close'), TOOL)).toEqual({
      type: 'note-menu-close',
    });
    expect(parseViewerMessage(message('open-external'), TOOL)).toEqual({ type: 'open-external' });
  });

  it('нормализует состояние позиции: нечисловые значения дают null', () => {
    expect(parseViewerMessage(message('state', { page: 3, pages: '10' }), TOOL)).toEqual({
      type: 'state',
      value: { page: 3, pages: 10 },
    });
    // Нечисловая строка и отсутствующее поле дают null.
    expect(parseViewerMessage(message('state', { page: 'нет' }), TOOL)).toEqual({
      type: 'state',
      value: { page: null, pages: null },
    });
  });

  it('ограничивает прогресс диапазоном 0–100', () => {
    expect(parseViewerMessage(message('progress', 150), TOOL)).toEqual({
      type: 'progress',
      value: 100,
    });
    expect(parseViewerMessage(message('progress', -5), TOOL)).toEqual({
      type: 'progress',
      value: 0,
    });
    expect(parseViewerMessage(message('progress', 'нет'), TOOL)).toBeNull();
  });

  it('подставляет активный инструмент в цвет и вид фигуры', () => {
    const anchor = { v: 1, chapter: 0, start: 0, end: 0, quote: '', percent: 0, page: null };
    expect(parseViewerMessage(message('text-point', { anchor }), TOOL)).toEqual({
      type: 'text-point',
      anchor,
      color: 'blue',
    });
    expect(parseViewerMessage(message('shape', { anchor }), TOOL)).toEqual({
      type: 'shape',
      anchor,
      shape: 'ellipse',
      geometry: '',
      color: 'blue',
    });
  });

  it('игнорирует сообщения без якоря и неизвестные типы', () => {
    expect(parseViewerMessage(message('text-point', {}), TOOL)).toBeNull();
    expect(parseViewerMessage(message('shape', {}), TOOL)).toBeNull();
    expect(parseViewerMessage(message('unknown'), TOOL)).toBeNull();
    expect(parseViewerMessage(null, TOOL)).toBeNull();
  });

  it('охраняет форму данных меню заметки', () => {
    expect(parseViewerMessage(message('note-menu', { noteId: 42 }), TOOL)).toBeNull();
    expect(
      parseViewerMessage(
        message('note-menu', {
          noteId: 'n1',
          noteType: 'shape',
          left: 10,
          top: 20,
          bottom: 30,
        }),
        TOOL,
      ),
    ).toEqual({
      type: 'note-menu',
      value: { noteId: 'n1', noteType: 'shape', left: 10, top: 20, bottom: 30 },
    });
  });

  it('различает отсутствие геометрии и её значение в перемещении', () => {
    const anchor = { v: 1, chapter: 0, start: 0, end: 0, quote: '', percent: 0, page: null };
    expect(parseViewerMessage(message('place-note', { noteId: 'n1', anchor }), TOOL)).toEqual({
      type: 'place-note',
      noteId: 'n1',
      anchor,
      geometry: undefined,
    });
    expect(
      parseViewerMessage(message('place-note', { noteId: 'n1', anchor, geometry: 'g' }), TOOL),
    ).toEqual({ type: 'place-note', noteId: 'n1', anchor, geometry: 'g' });
  });

  it('сообщает об ошибке с текстом по умолчанию', () => {
    expect(parseViewerMessage(message('error', undefined, { message: 'сбой' }), TOOL)).toEqual({
      type: 'error',
      message: 'сбой',
    });
    expect(parseViewerMessage(message('error'), TOOL)).toEqual({
      type: 'error',
      message: 'не удалось отобразить книгу',
    });
  });
});

describe('протокол рабочего места: тема области чтения', () => {
  it('собирает сообщение с токенами палитры и стороны', () => {
    const dark = buildReaderThemeMessage('gruvbox', 'dark');
    expect(dark.type).toBe('reader-theme');
    expect(dark.value.id).toBe('dark');
    expect(dark.value.tokens).toEqual(readerThemeTokens('gruvbox', 'dark'));
    expect(dark.value.notes).toEqual(readerThemeNoteTones('gruvbox', 'dark'));
    expect(dark.value.page).toEqual(readerPageColors('gruvbox'));
  });

  it('для светлой стороны отдаёт светлые токены и тона', () => {
    const light = buildReaderThemeMessage('mist', 'light');
    expect(light.value.id).toBe('light');
    expect(light.value.tokens.background).toBe('#ffffff');
    expect(light.value.notes.yellow).toBe('#fde68a');
  });

  it('стороны различаются фоном и тонами заметок', () => {
    const light = buildReaderThemeMessage('gruvbox', 'light');
    const dark = buildReaderThemeMessage('gruvbox', 'dark');
    expect(light.value.tokens.background).not.toBe(dark.value.tokens.background);
    expect(light.value.notes.yellow).not.toBe(dark.value.notes.yellow);
  });
});
