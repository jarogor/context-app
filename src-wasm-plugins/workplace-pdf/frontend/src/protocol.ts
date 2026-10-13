/** Протокол обмена с приложением и разбор входящих сообщений.
 *
 * Канал `texture-workplace`: модуль сообщает приложению о готовности, позиции,
 * выделении и заметках, а от приложения принимает книгу, масштаб, инструмент,
 * тему и команды. Разбор входящих сообщений живёт здесь и не зависит от
 * остальных модулей: приложение присылает opaque-данные.
 */
import type { ViewerNote, ViewerTool } from './types';

/** Канал сообщений между областью содержимого и модулем рисования. */
export const CHANNEL = 'texture-workplace';

/** Отправка сообщения приложению. */
export function post(message: Record<string, unknown> & { type: string }): void {
  parent.postMessage({ channel: CHANNEL, ...message }, '*');
}

/** Команда «открыть книгу». */
export interface OpenMessage {
  /** Тип сообщения. */
  type: 'open';
  /** Книга в base64. */
  data: string;
  /** Начальная позиция чтения в процентах. */
  position: number;
  /** Начальный масштаб в процентах. */
  zoom: number;
}

/** Команда «задать масштаб». */
export interface ZoomMessage {
  /** Тип сообщения. */
  type: 'zoom';
  /** Масштаб в процентах. */
  value: number;
}

/** Команда «перейти к странице или заметке». */
export interface GotoMessage {
  /** Тип сообщения. */
  type: 'goto';
  /** Параметры перехода. */
  value: {
    /** Номер страницы. */
    page?: number;
    /** Непрозрачный якорь заметки (JSON). */
    anchor?: string;
    /** Идентификатор заметки. */
    noteId?: string;
  };
}

/** Команда меню заметки: перемещение или правка границ. */
export interface NoteMenuActionMessage {
  /** Тип сообщения. */
  type: 'note-menu-action';
  /** Параметры команды. */
  value: {
    /** Идентификатор заметки. */
    noteId?: string;
    /** Действие: перемещение или правка границ. */
    action?: string;
  };
}

/** Список заметок книги. */
export interface NotesMessage {
  /** Тип сообщения. */
  type: 'notes';
  /** Заметки книги. */
  value: ViewerNote[];
}

/** Активный инструмент создания заметок. */
export interface ToolMessage {
  /** Тип сообщения. */
  type: 'tool';
  /** Нормализованный инструмент. */
  value: ViewerTool;
}

/** Тема области чтения. */
export interface ReaderThemeMessage {
  /** Тип сообщения. */
  type: 'reader-theme';
  /** Значение темы (сторона, токены, тона заметок, цвета страницы). */
  value: ReaderThemeValue | null;
}

/** Значение темы области чтения. */
export interface ReaderThemeValue {
  /** Сторона темы. */
  id?: string;
  /** Токены поверхности чтения. */
  tokens?: Record<string, unknown>;
  /** Мягкие тона заметок. */
  notes?: Record<string, string>;
  /** Цвета перекраски страницы. */
  page?: { paper?: string; ink?: string };
}

/** Сигнал возврата видимости области чтения. */
export interface ShowMessage {
  /** Тип сообщения. */
  type: 'show';
}

/** Разобранное входящее сообщение. */
export type IncomingMessage =
  | OpenMessage
  | ZoomMessage
  | GotoMessage
  | NoteMenuActionMessage
  | NotesMessage
  | ToolMessage
  | ReaderThemeMessage
  | ShowMessage;

/** Нормализация инструмента создания заметок значениями по умолчанию. */
export function normalizeTool(value: unknown): ViewerTool {
  const source = (value && typeof value === 'object' ? value : {}) as {
    type?: unknown;
    shape?: unknown;
    color?: unknown;
  };
  return {
    type: (source.type as ViewerTool['type']) || 'quote',
    shape: (source.shape as ViewerTool['shape']) || 'line',
    color: typeof source.color === 'string' ? source.color : 'yellow',
  };
}

/**
 * Разбор входящего сообщения.
 *
 * Сообщение чужого канала или неизвестного типа даёт `null`. Известные типы
 * приводятся к строгой форме; инструмент нормализуется значениями по умолчанию.
 */
export function parseIncoming(data: unknown): IncomingMessage | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const message = data as { channel?: unknown; type?: unknown; value?: unknown };
  if (message.channel !== CHANNEL || typeof message.type !== 'string') {
    return null;
  }
  const raw = data as Record<string, unknown>;
  switch (message.type) {
    case 'open':
      return {
        type: 'open',
        data: String(raw.data ?? ''),
        position: Number(raw.position) || 0,
        zoom: Number(raw.zoom) || 100,
      };
    case 'zoom':
      return { type: 'zoom', value: Number(raw.value) || 100 };
    case 'goto': {
      const value = (raw.value && typeof raw.value === 'object' ? raw.value : {}) as GotoMessage['value'];
      return { type: 'goto', value };
    }
    case 'note-menu-action': {
      const value = (raw.value && typeof raw.value === 'object' ? raw.value : {}) as NoteMenuActionMessage['value'];
      return { type: 'note-menu-action', value };
    }
    case 'notes':
      return { type: 'notes', value: Array.isArray(raw.value) ? (raw.value as ViewerNote[]) : [] };
    case 'tool':
      return { type: 'tool', value: normalizeTool(raw.value) };
    case 'reader-theme':
      return {
        type: 'reader-theme',
        value: (raw.value && typeof raw.value === 'object' ? raw.value : null) as ReaderThemeValue | null,
      };
    case 'show':
      return { type: 'show' };
    default:
      return null;
  }
}

/** Декодирование base64 в байты книги. */
export function decodeBase64(value: string): Uint8Array {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
