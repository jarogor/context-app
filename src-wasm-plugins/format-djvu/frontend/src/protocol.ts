/** Протокол обмена с приложением и разбор входящих сообщений.
 *
 * Канал `context-workplace`: модуль сообщает приложению о готовности, позиции,
 * выделении и заметках, а от приложения принимает книгу, масштаб, инструмент,
 * тему и команды. Разбор входящих сообщений живёт здесь и не зависит от
 * остальных модулей: приложение присылает opaque-данные.
 */
import type { ViewerNote, ViewerTool } from './types';
import type { BindingsMessage, CommandMessage } from './hotkeys';

/** Канал сообщений между областью содержимого и модулем рисования. */
export const CHANNEL = 'context-workplace';

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
  /** Токены области чтения. */
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

/** Запрос поиска по содержимому книги. */
export interface SearchMessage {
  /** Тип сообщения. */
  type: 'search';
  /** Параметры поиска. */
  value: {
    /** Запрос поиска; пустой запрос снимает результат. */
    query?: string;
  };
}

/** Переход к соседнему вхождению поиска. */
export interface SearchStepMessage {
  /** Тип сообщения. */
  type: 'search-step';
  /** Параметры перехода. */
  value: {
    /** Направление: `1` — следующее вхождение, `-1` — предыдущее. */
    delta?: number;
  };
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
  | ShowMessage
  | SearchMessage
  | SearchStepMessage
  | BindingsMessage
  | CommandMessage;

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
    case 'search': {
      const value = (raw.value && typeof raw.value === 'object' ? raw.value : {}) as SearchMessage['value'];
      return { type: 'search', value: { query: String(value.query ?? '') } };
    }
    case 'search-step': {
      const value = (raw.value && typeof raw.value === 'object' ? raw.value : {}) as SearchStepMessage['value'];
      return { type: 'search-step', value: { delta: Number(value.delta) || 1 } };
    }
    case 'hotkey-bindings':
      return {
        type: 'hotkey-bindings',
        value: Array.isArray(raw.value) ? (raw.value as BindingsMessage['value']) : [],
      };
    case 'command': {
      const value = (raw.value && typeof raw.value === 'object' ? raw.value : {}) as CommandMessage['value'];
      return { type: 'command', value: { id: typeof value.id === 'string' ? value.id : '' } };
    }
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
