/** Протокол сообщений между приложением и модулем рисования плагина формата.
 *
 * Приложение шлёт команды, модуль — события. Форма сообщений общая для всех
 * плагинов формата чтения (см. `workplace-protocol.ts` приложения): плагин не
 * знает ни модели заметок, ни устройства оболочки, а обменивается непрозрачными
 * данными.
 */

/** Канал сообщений области содержимого книги. */
export const WORKPLACE_CHANNEL = 'context-workplace';

/** Тема области чтения, присланная приложением. */
export interface ReaderThemeInput {
  /** Сторона темы. */
  id?: string;
  /** Токены области. */
  tokens?: Record<string, string | number>;
  /** Мягкие тона заметок по идентификаторам цвета. */
  notes?: Record<string, string>;
  /** Плоские непрозрачные тона подсветки цитат. */
  solid?: Record<string, string>;
  /** Гарнитура книги (CSS `font-family`). */
  font?: string;
}

/** Заметка книги, присланная приложением. */
export interface ViewerNote {
  /** Идентификатор заметки. */
  id: string;
  /** Тип заметки. */
  type?: string;
  /** Непрозрачный якорь заметки (JSON). */
  anchor?: string;
  /** Текст цитаты. */
  quote?: string;
  /** Идентификатор цвета. */
  color?: string;
  /** Номер страницы. */
  page?: number | null;
  /** Текст карточки. */
  text?: string;
  /** Вид фигуры. */
  shape?: string;
  /** Непрозрачная геометрия фигуры (JSON). */
  geometry?: string;
}

/** Активный инструмент создания заметок. */
export interface ViewerTool {
  /** Тип инструмента. */
  type: string;
  /** Вид фигуры. */
  shape: string;
  /** Идентификатор цвета. */
  color: string;
}

/** Привязка клавиши, присланная приложением.
 *
 * Правил разбора сочетаний у плагина нет: приложение присылает готовые поля
 * события, и плагин лишь сравнивает их.
 */
export interface ViewerBinding {
  /** Идентификатор действия приложения. */
  id: string;
  /** Физический код клавиши (`KeyboardEvent.code`). */
  code?: string;
  /** Зажат ли Ctrl. */
  ctrl?: boolean;
  /** Зажат ли Alt. */
  alt?: boolean;
  /** Зажат ли Shift. */
  shift?: boolean;
  /** Зажат ли Meta. */
  meta?: boolean;
  /** Описание сочетания (справочно). */
  combo?: string;
}

/** Входящее сообщение приложения. */
export type IncomingMessage =
  | { type: 'open'; data: string; title: string; position: number; zoom: number }
  | { type: 'zoom'; value: number }
  | { type: 'goto'; value: { noteId?: string; anchor?: string; page?: number; chapter?: number } }
  | { type: 'note-menu-action'; value: { noteId: string; action: string } }
  | { type: 'notes'; value: ViewerNote[] }
  | { type: 'tool'; value: ViewerTool }
  | { type: 'reader-theme'; value: ReaderThemeInput }
  | { type: 'reader-locale'; value: string }
  | { type: 'show' }
  | { type: 'clear-selection' }
  | { type: 'footnote-close' }
  | { type: 'search'; value: { query: string } }
  | { type: 'search-step'; value: { delta: number } }
  | { type: 'hotkey-bindings'; value: ViewerBinding[] }
  | { type: 'command'; value: { id: string } };

/** Отправка сообщения приложению. */
export function post(message: Record<string, unknown>): void {
  parent.postMessage({ channel: WORKPLACE_CHANNEL, ...message }, '*');
}

/** Разбор входящего сообщения; неизвестные и неполные дают `null`. */
export function parseIncoming(data: unknown): IncomingMessage | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const message = data as { channel?: unknown; type?: unknown };
  if (message.channel !== WORKPLACE_CHANNEL || typeof message.type !== 'string') {
    return null;
  }
  const raw = data as Record<string, unknown>;
  switch (message.type) {
    case 'open':
      return {
        type: 'open',
        data: String(raw.data ?? ''),
        title: String(raw.title ?? ''),
        position: Number(raw.position) || 0,
        zoom: Number(raw.zoom) || 100,
      };
    case 'zoom':
      return { type: 'zoom', value: Number(raw.value) || 100 };
    case 'goto': {
      const value = (raw.value ?? {}) as {
        noteId?: unknown;
        anchor?: unknown;
        page?: unknown;
        chapter?: unknown;
      };
      return {
        type: 'goto',
        value: {
          noteId: typeof value.noteId === 'string' ? value.noteId : undefined,
          anchor: typeof value.anchor === 'string' ? value.anchor : undefined,
          page: typeof value.page === 'number' ? value.page : undefined,
          chapter: typeof value.chapter === 'number' ? value.chapter : undefined,
        },
      };
    }
    case 'note-menu-action': {
      const value = (raw.value ?? {}) as { noteId?: unknown; action?: unknown };
      return {
        type: 'note-menu-action',
        value: { noteId: String(value.noteId ?? ''), action: String(value.action ?? '') },
      };
    }
    case 'notes':
      return { type: 'notes', value: Array.isArray(raw.value) ? (raw.value as ViewerNote[]) : [] };
    case 'tool': {
      const value = (raw.value ?? {}) as Record<string, unknown>;
      return {
        type: 'tool',
        value: {
          type: String(value.type ?? 'quote'),
          shape: String(value.shape ?? 'line'),
          color: String(value.color ?? 'yellow'),
        },
      };
    }
    case 'reader-theme':
      return { type: 'reader-theme', value: (raw.value ?? {}) as ReaderThemeInput };
    case 'reader-locale':
      return { type: 'reader-locale', value: String(raw.value ?? 'ru') };
    case 'show':
      return { type: 'show' };
    case 'clear-selection':
      return { type: 'clear-selection' };
    case 'footnote-close':
      return { type: 'footnote-close' };
    case 'search': {
      const value = (raw.value ?? {}) as { query?: unknown };
      return { type: 'search', value: { query: String(value.query ?? '') } };
    }
    case 'search-step': {
      const value = (raw.value ?? {}) as { delta?: unknown };
      return { type: 'search-step', value: { delta: Number(value.delta) || 1 } };
    }
    case 'hotkey-bindings':
      return {
        type: 'hotkey-bindings',
        value: Array.isArray(raw.value) ? (raw.value as ViewerBinding[]) : [],
      };
    case 'command': {
      const value = (raw.value ?? {}) as { id?: unknown };
      return { type: 'command', value: { id: String(value.id ?? '') } };
    }
    default:
      return null;
  }
}

/** Декодирование base64 в байты. */
export function decodeBase64(value: string): Uint8Array {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Декодирование base64 как UTF-8 текста. */
export function decodeText(value: string): string {
  return new TextDecoder('utf-8').decode(decodeBase64(value));
}
