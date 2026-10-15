/** Общие имена и элементы разметки модуля рисования.
 *
 * Классы и идентификаторы совпадают с оформлением (`style.css`) и прежним
 * единым файлом плагина: по ним строятся и находятся наложения.
 */

/** Элемент области прокрутки книги. */
export const viewer = document.getElementById('viewer') as HTMLElement;
/** Контейнер страниц книги. */
export const pagesEl = document.getElementById('pages') as HTMLElement;
/** Сообщение о состоянии загрузки книги. */
export const status = document.getElementById('status') as HTMLElement;

/** Доля прочитанного по положению прокрутки. */
export function scrollProgress(): number {
  const max = viewer.scrollHeight - viewer.clientHeight;
  return max > 0 ? Math.max(0, Math.min(100, (viewer.scrollTop / max) * 100)) : 0;
}

/** Класс страницы книги. */
export const PAGE_CLASS = 'page';
/** Класс наложения заметок страницы. */
export const OVERLAY_CLASS = 'overlay';
/** Класс невидимого текстового слоя страницы. */
export const TEXT_LAYER_CLASS = 'textLayer';
/** Класс слоя активного выделения. */
export const SELECTION_LAYER_CLASS = 'selection-layer';
/** Класс подсветки заметки-цитаты. */
export const NOTE_CLASS = 'note';
/** Класс текстовой карточки заметки. */
export const NOTE_CARD_CLASS = 'note-card';
/** Класс фигуры заметки. */
export const NOTE_SHAPE_CLASS = 'note-shape';
/** Класс маркера границы цитаты при правке. */
export const NOTE_HANDLE_CLASS = 'note-handle';
/** Класс направляющих перемещения заметки. */
export const MOVE_GUIDE_CLASS = 'note-move-guide';
/** Класс рамки предпросмотра фигуры. */
export const NOTE_PREVIEW_CLASS = 'note-preview';

/** Наложение заметок страницы. */
export function overlayOf(pageEl: Element): Element | null {
  return pageEl.querySelector(`.${OVERLAY_CLASS}`);
}

/** Элемент страницы, которому принадлежит узел. */
export function pageOf(node: Node | null): HTMLElement | null {
  const element = elementOf(node);
  return element ? (element.closest(`.${PAGE_CLASS}`) as HTMLElement | null) : null;
}

/** Ближайший элемент узла (сам узел или его родитель). */
export function elementOf(node: Node | null): Element | null {
  if (!node) {
    return null;
  }
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

/** Поиск наложения и страницы заметки по её идентификатору. */
export function locateNote(noteId: string): {
  /** Элемент заметки (или null). */
  element: Element | null;
  /** Страница заметки (или null). */
  pageEl: HTMLElement | null;
  /** Наложение заметок страницы (или null). */
  overlay: Element | null;
} {
  const element = document.querySelector(`[data-note-id="${noteId}"]`);
  const pageEl = element ? (element.closest(`.${PAGE_CLASS}`) as HTMLElement | null) : null;
  const overlay = pageEl ? overlayOf(pageEl) : null;
  return { element, pageEl, overlay };
}
