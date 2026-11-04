/** Протокол сообщений между областью содержимого книги и модулем рисования.
 *
 * Модуль чист от Svelte: определяет канал, типы входящих сообщений и их разбор.
 * Область содержимого шлёт сообщения команд, а от модуля принимает события и
 * передаёт их в колбэки; разбор и проверка формы данных живут здесь.
 */

import { t } from '@context/i18n';
import type { NoteColor, NoteTool, NoteType, ShapeKind } from '../notes/notes';
import type { QuoteAnchor } from './reader/anchor';
import type { FileAnnotationBatch, FileBookmark, FileChapter } from './file-properties';
import {
  normalizeBookmarks,
  parseFileAnnotationBatch,
} from './file-properties';
import {
  readerPageColors,
  readerThemeNoteTones,
  readerThemeTokens,
  type PaletteId,
  type ReaderNoteTones,
  type ReaderPageColors,
  type ReaderThemeId,
  type ReaderThemeTokens,
} from '@context/ui';

/** Канал сообщений между областью содержимого и модулем рисования. */
export const WORKPLACE_CHANNEL = 'context-workplace';

/** Тема области чтения, передаваемая модулю рисования.
 *
 * Модуль рисуется в изолированной песочнице и не наследует CSS оболочки, поэтому
 * приложение передаёт ему готовые значения темы: сторону (идентификатор) и
 * токены области и мягких тонов заметок.
 */
export interface WorkplaceReaderTheme {
  /** Сторона темы области чтения. */
  id: ReaderThemeId;
  /** Токены области чтения (фон, текст, вторичный текст, ссылки). */
  tokens: ReaderThemeTokens;
  /** Мягкие тона заметок по стороне темы. */
  notes: ReaderNoteTones;
  /** Цвета перекраски страницы в тёмной теме (бумага и текст). */
  page: ReaderPageColors;
}

/** Сборка сообщения о теме области чтения для модуля рисования.
 *
 * Значения берутся из дизайн-системы по палитре и стороне, поэтому у хоста и
 * плагинов форматов один источник токенов.
 */
export function buildReaderThemeMessage(
  palette: PaletteId,
  theme: ReaderThemeId,
): { type: 'reader-theme'; value: WorkplaceReaderTheme } {
  return {
    type: 'reader-theme',
    value: {
      id: theme,
      tokens: readerThemeTokens(palette, theme),
      notes: readerThemeNoteTones(palette, theme),
      page: readerPageColors(palette),
    },
  };
}

/** Возможности модуля рисования, сообщённые после загрузки. */
export interface WorkplaceCapabilities {
  /** Поддерживает ли модуль изменение масштаба. */
  zoom?: boolean;
  /** Поддерживает ли модуль страницы. */
  pages?: boolean;
  /** Поддерживает ли модуль выделение текста. */
  selection?: boolean;
  /** Умеет ли модуль рисовать миниатюры страниц по запросу. */
  thumbnails?: boolean;
  /** Умеет ли модуль разбирать встроенные в файл пометки. */
  annotations?: boolean;
  /** Умеет ли модуль читать встроенные закладки файла. */
  bookmarks?: boolean;
  /** Текучая ли книга: текст течёт по колонке и гарнитура применима. */
  flowing?: boolean;
}

/** Миниатюра страницы, нарисованная модулем по запросу. */
export interface WorkplaceThumbnail {
  /** Номер страницы (1-based). */
  page: number;
  /** Картинка миниатюры как data-URL. */
  dataUrl: string;
  /** Ширина картинки в пикселях. */
  width: number;
  /** Высота картинки в пикселях. */
  height: number;
}

/** Состояние позиции модуля: текущая страница и их общее число. */
export interface WorkplaceState {
  /** Номер текущей страницы или `null`. */
  page: number | null;
  /** Общее число страниц или `null`. */
  pages: number | null;
  /** Масштаб, выбранный модулем при открытии (или `null`). */
  zoom?: number | null;
}

/** Результат поиска по содержимому книги, сообщённый модулем рисования.
 *
 * Поиск выполняет модуль: он владеет текстом книги (текстовым слоем страниц), а
 * приложение не знает о формате. Оболочке достаточно числа вхождений и номера
 * текущего, чтобы показать счётчик и запросить переход.
 */
export interface WorkplaceSearch {
  /** Сколько вхождений найдено. */
  total: number;
  /** Номер вхождения, к которому ведёт переход; `null` — перехода нет. */
  index: number | null;
  /** Найдено больше вхождений, чем модуль готов показать. */
  truncated?: boolean;
}

/** Поиск, о котором сообщил модуль рисования. */
export interface WorkplaceSearchResult extends WorkplaceSearch {
  /** Запрос, по которому построен результат: ответ на прежний запрос не применяется. */
  query: string;
}

/** Контекстное меню заметки: прямоугольник в координатах области содержимого. */
export interface WorkplaceNoteMenu {
  /** Идентификатор заметки. */
  noteId: string;
  /** Тип заметки. */
  noteType: NoteType;
  /** Экранная координата левого края. */
  left: number;
  /** Экранная координата верхнего края. */
  top: number;
  /** Экранная координата нижнего края. */
  bottom: number;
}

/** Сноска книги, показанная плагином в меню у её маркера.
 *
 * Содержимое готовит плагин: он владеет разметкой книги, а оболочка показывает
 * меню в своей системе оформления.
 */
export interface WorkplaceFootnote {
  /** HTML содержимого сноски. */
  html: string;
  /** Идентификатор якоря сноски. */
  anchor: string;
  /** Экранная координата левого края маркера. */
  left: number;
  /** Экранная координата верхнего края маркера. */
  top: number;
  /** Экранная координата нижнего края маркера. */
  bottom: number;
}

/** Разобранное входящее сообщение модуля рисования. */
export type ViewerMessage =
  | { type: 'ready' }
  | { type: 'capabilities'; value: WorkplaceCapabilities }
  | { type: 'state'; value: WorkplaceState }
  | { type: 'progress'; value: number }
  | { type: 'selection'; anchor: QuoteAnchor; x: number; y: number }
  | { type: 'selection-cleared' }
  | { type: 'text-point'; anchor: QuoteAnchor; color: NoteColor }
  | { type: 'shape'; anchor: QuoteAnchor; shape: ShapeKind; geometry: string; color: NoteColor }
  | { type: 'note-click'; noteId: string }
  | { type: 'note-menu'; value: WorkplaceNoteMenu }
  | { type: 'note-menu-close' }
  | { type: 'footnote'; value: WorkplaceFootnote }
  | { type: 'footnote-close' }
  | { type: 'contents'; value: FileChapter[] }
  | { type: 'place-note'; noteId: string; anchor: QuoteAnchor; geometry: string | undefined }
  | { type: 'error'; message: string }
  | { type: 'open-external' }
  | { type: 'open-link'; href: string }
  | { type: 'hotkey'; actionId: string }
  | { type: 'search'; value: WorkplaceSearchResult }
  | { type: 'bookmarks'; value: FileBookmark[] }
  | { type: 'thumbs'; value: WorkplaceThumbnail[] }
  | { type: 'file-annotations'; value: FileAnnotationBatch };

/** Проверка источника и канала сообщения области содержимого. */
export function isWorkplaceMessage(
  event: MessageEvent,
  source: Window | null | undefined,
): boolean {
  if (event.source !== source) {
    return false;
  }
  const message = event.data as { channel?: unknown } | null | undefined;
  return message?.channel === WORKPLACE_CHANNEL;
}

/** Разбор входящего сообщения в типизированное событие.
 *
 * Неизвестные типы и сообщения с неполными данными дают `null`: вызывающая
 * сторона игнорирует их, не выполняя действий. Отсутствующие цвет и вид фигуры
 * берутся из активного инструмента как значения по умолчанию.
 */
export function parseViewerMessage(data: unknown, fallback: NoteTool): ViewerMessage | null {
  const message = data as
    | { type?: unknown; value?: unknown; message?: unknown }
    | null
    | undefined;
  if (!message || typeof message.type !== 'string') {
    return null;
  }
  switch (message.type) {
    case 'ready':
      return { type: 'ready' };
    case 'capabilities':
      return { type: 'capabilities', value: (message.value as WorkplaceCapabilities) ?? {} };
    case 'state': {
      const value = (message.value as { page?: unknown; pages?: unknown; zoom?: unknown }) ?? {};
      const page = Number.isFinite(Number(value.page)) ? Number(value.page) : null;
      const pages = Number.isFinite(Number(value.pages)) ? Number(value.pages) : null;
      const zoom = Number.isFinite(Number(value.zoom)) ? Number(value.zoom) : null;
      return { type: 'state', value: { page, pages, zoom } };
    }
    case 'progress':
      return typeof message.value === 'number'
        ? { type: 'progress', value: Math.max(0, Math.min(100, message.value)) }
        : null;
    case 'selection': {
      const value = (message.value as { anchor?: QuoteAnchor; x?: number; y?: number }) ?? {};
      if (!value.anchor) {
        return null;
      }
      return {
        type: 'selection',
        anchor: value.anchor,
        x: Number(value.x) || 0,
        y: Number(value.y) || 0,
      };
    }
    case 'selection-cleared':
      return { type: 'selection-cleared' };
    case 'text-point': {
      const value = (message.value as { anchor?: QuoteAnchor; color?: unknown }) ?? {};
      if (!value.anchor) {
        return null;
      }
      return {
        type: 'text-point',
        anchor: value.anchor,
        color: String(value.color ?? fallback.color) as NoteColor,
      };
    }
    case 'shape': {
      const value =
        (message.value as {
          anchor?: QuoteAnchor;
          shape?: unknown;
          geometry?: unknown;
          color?: unknown;
        }) ?? {};
      if (!value.anchor) {
        return null;
      }
      return {
        type: 'shape',
        anchor: value.anchor,
        shape: String(value.shape ?? fallback.shape) as ShapeKind,
        geometry: String(value.geometry ?? ''),
        color: String(value.color ?? fallback.color) as NoteColor,
      };
    }
    case 'note-click': {
      const value = (message.value as { noteId?: unknown }) ?? {};
      return typeof value.noteId === 'string' ? { type: 'note-click', noteId: value.noteId } : null;
    }
    case 'note-menu': {
      const value =
        (message.value as {
          noteId?: unknown;
          noteType?: unknown;
          left?: unknown;
          top?: unknown;
          bottom?: unknown;
        }) ?? {};
      if (typeof value.noteId !== 'string') {
        return null;
      }
      return {
        type: 'note-menu',
        value: {
          noteId: value.noteId,
          noteType: String(value.noteType ?? 'quote') as NoteType,
          left: Number(value.left) || 0,
          top: Number(value.top) || 0,
          bottom: Number(value.bottom) || 0,
        },
      };
    }
    case 'note-menu-close':
      return { type: 'note-menu-close' };
    case 'footnote-close':
      return { type: 'footnote-close' };
    case 'contents': {
      const value = Array.isArray(message.value) ? message.value : [];
      return {
        type: 'contents',
        value: value.map((item) => {
          const chapter = (item ?? {}) as { index?: unknown; title?: unknown };
          return { index: Number(chapter.index) || 0, title: String(chapter.title ?? '') };
        }),
      };
    }
    case 'footnote': {
      const value = (message.value as { html?: unknown; anchor?: unknown; left?: unknown; top?: unknown; bottom?: unknown }) ?? {};
      return {
        type: 'footnote',
        value: {
          html: String(value.html ?? ''),
          anchor: String(value.anchor ?? ''),
          left: Number(value.left) || 0,
          top: Number(value.top) || 0,
          bottom: Number(value.bottom) || 0,
        },
      };
    }
    case 'place-note': {
      const value =
        (message.value as { noteId?: unknown; anchor?: QuoteAnchor; geometry?: unknown }) ?? {};
      if (typeof value.noteId !== 'string' || !value.anchor) {
        return null;
      }
      return {
        type: 'place-note',
        noteId: value.noteId,
        anchor: value.anchor,
        geometry: value.geometry === undefined ? undefined : String(value.geometry),
      };
    }
    case 'error':
      return {
      type: 'error',
      message: String(message.message ?? t('app.reader.failedGeneric')),
    };
    case 'open-external':
      return { type: 'open-external' };
    case 'open-link': {
      const href = String((message.value as { href?: unknown } | null)?.href ?? '').trim();
      return href ? { type: 'open-link', href } : null;
    }
    case 'hotkey': {
      const actionId = String((message.value as { id?: unknown } | null)?.id ?? '').trim();
      return actionId ? { type: 'hotkey', actionId } : null;
    }
    case 'search': {
      const value =
        (message.value as {
          query?: unknown;
          total?: unknown;
          index?: unknown;
          truncated?: unknown;
        }) ?? {};
      const total = Number(value.total);
      if (!Number.isFinite(total) || total < 0) {
        return null;
      }
      const index = Number(value.index);
      return {
        type: 'search',
        value: {
          query: String(value.query ?? ''),
          total: Math.trunc(total),
          index: Number.isFinite(index) ? Math.trunc(index) : null,
          truncated: value.truncated === true,
        },
      };
    }
    case 'bookmarks':
      return { type: 'bookmarks', value: normalizeBookmarks(message.value) };
    case 'thumbs': {
      const items = Array.isArray(message.value) ? message.value : [];
      const thumbnails = items
        .map((item) => {
          const record = (item ?? {}) as Record<string, unknown>;
          const page = Number(record.page);
          const dataUrl = String(record.dataUrl ?? '');
          if (!Number.isFinite(page) || page < 1 || !dataUrl.startsWith('data:image/')) {
            return null;
          }
          return {
            page: Math.trunc(page),
            dataUrl,
            width: Math.max(0, Number(record.width) || 0),
            height: Math.max(0, Number(record.height) || 0),
          };
        })
        .filter((item): item is WorkplaceThumbnail => item !== null);
      return { type: 'thumbs', value: thumbnails };
    }
    case 'file-annotations':
      return { type: 'file-annotations', value: parseFileAnnotationBatch(message.value) };
    default:
      return null;
  }
}
