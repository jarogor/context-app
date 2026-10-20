/** Операции над заметками: меню, перемещение, правка границ цитаты.
 *
 * Собственную копию меню плагин не строит: меню принадлежит оболочке и общее для
 * всех режимов чтения. Плагин лишь сообщает прямоугольник заметки в координатах
 * области чтения, а команды перемещения и правки границ приходят обратно
 * сообщением `note-menu-action`.
 */
import { resolveResizeCarets } from './carets';
import { MOVE_GUIDE_CLASS, NOTE_HANDLE_CLASS, NOTE_SHAPE_CLASS, locateNote, overlayOf, pagesEl } from './dom';
import { editor } from './editing-state';
import { edgeRects } from './carets';
import { parseGeometry } from './geometry';
import { anchorOf, drawNotes } from './notes';
import { post } from './protocol';
import type { NoteAnchor, ViewerNote } from './types';

/** Перерисовка заметок на всех страницах книги. */
export function redrawAllNotes(notes: ViewerNote[]): void {
  for (const pageEl of pagesEl.children) {
    drawNotes(pageEl as HTMLElement, notes);
  }
}

/** Закрытие контекстного меню заметки: снимается состояние и меню оболочки. */
export function closeNoteMenu(): void {
  if (editor.noteMenu) {
    post({ type: 'note-menu-close' });
  }
  editor.noteMenu = null;
}

/** Снятие направляющих перемещения. */
export function clearMoveGuide(): void {
  if (editor.moveGuide) {
    editor.moveGuide.remove();
    editor.moveGuide = null;
  }
}

/** Элемент заметки для рамки направляющих: карточка, фигура или подсветка. */
function noteElement(noteId: string): Element | null {
  const { element } = locateNote(noteId);
  if (!element) {
    return null;
  }
  if (element.classList.contains(NOTE_SHAPE_CLASS)) {
    return element.querySelector('line,rect,ellipse');
  }
  return element;
}

/** Показ направляющих перемещения вокруг выбранной заметки. */
export function showMoveGuide(): void {
  clearMoveGuide();
  if (!editor.moveDrag) {
    return;
  }
  const { overlay, pageEl } = locateNote(editor.moveDrag.note.id);
  const target = noteElement(editor.moveDrag.note.id);
  if (!overlay || !pageEl || !target) {
    return;
  }
  const bounds = pageEl.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const guide = document.createElement('div');
  guide.className = MOVE_GUIDE_CLASS;
  guide.dataset.guide = 'move';
  guide.style.left = rect.left - bounds.left + 'px';
  guide.style.top = rect.top - bounds.top + 'px';
  guide.style.width = rect.width + 'px';
  guide.style.height = rect.height + 'px';
  overlay.appendChild(guide);
  editor.moveGuide = guide;
}

/**
 * Сообщение оболочке об открытии меню заметки.
 *
 * У фигуры наложение — SVG во всю страницу; для привязки меню берётся её
 * графический элемент, иначе меню уезжает к низу страницы.
 */
export function openNoteMenu(note: ViewerNote, element: Element): void {
  const graphic = element.querySelector('line,rect,ellipse') || element;
  const rect = graphic.getBoundingClientRect();
  const noteType = note.type || 'quote';
  editor.noteMenu = { noteId: note.id, noteType };
  post({
    type: 'note-menu',
    value: {
      noteId: note.id,
      noteType,
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
    },
  });
}

/** Сообщение приложению о новом размещении заметки. */
export function placeNote(
  notes: ViewerNote[],
  note: ViewerNote,
  anchor: NoteAnchor,
  geometry?: string,
): void {
  note.anchor = JSON.stringify(anchor);
  if (geometry !== undefined) {
    note.geometry = geometry;
  }
  const value: Record<string, unknown> = { noteId: note.id, anchor };
  if (geometry !== undefined) {
    value.geometry = geometry;
  }
  post({ type: 'place-note', value });
  redrawAllNotes(notes);
}

/** Отмена незавершённой протяжки фигуры со снятием предпросмотра. */
export function cancelShapeDrag(): void {
  if (editor.shapeDrag && editor.shapeDrag.preview) {
    editor.shapeDrag.preview.remove();
  }
  editor.shapeDrag = null;
}

/** Включение режима перемещения заметки. */
export function startMove(note: ViewerNote): void {
  const anchor = anchorOf(note);
  if (!anchor) {
    return;
  }
  // Отмена незавершённой протяжки: клик по пункту меню под инструментом
  // фигуры/текста иначе превратился бы в рисование и захватил указатель.
  cancelShapeDrag();
  editor.moveDrag = {
    note,
    anchor,
    geometry: parseGeometry(note.geometry),
  };
  editor.editing = { noteId: note.id, mode: 'move' };
  document.body.dataset.editing = 'move';
  showMoveGuide();
}

/**
 * Включение режима правки границ цитаты в DjVu (по тексту страницы).
 *
 * Анкер цитаты хранит прямоугольники, а не смещения текста. Чтобы тянуть границы
 * по символам, концы выделения восстанавливаются как позиции каретки в текстовом
 * слое, а прямоугольники строятся из диапазона между ними; сами прямоугольники
 * напрямую не двигаются.
 */
export function startResize(note: ViewerNote, notes: ViewerNote[]): void {
  const anchor = anchorOf(note);
  if (!anchor || !anchor.rects || anchor.rects.length === 0) {
    return;
  }
  const { pageEl } = locateNote(note.id);
  editor.resizeDrag = { note, anchor, edge: 'start' };
  editor.editing = { noteId: note.id, mode: 'resize' };
  // Слой подсветок перестаёт перехватывать указатель (см. CSS), и только затем
  // концы цитаты восстанавливаются как каретки по тексту.
  document.body.dataset.editing = 'resize';
  if (pageEl) {
    const caret = resolveResizeCarets(anchor, pageEl);
    if (caret) {
      editor.resizeDrag.pageEl = pageEl;
      editor.resizeDrag.startCaret = caret.start;
      editor.resizeDrag.endCaret = caret.end;
    }
  }
  redrawAllNotes(notes);
  renderResizeHandles();
}

/** Выход из режима правки заметки. */
export function stopEditing(): void {
  editor.editing = null;
  editor.moveDrag = null;
  editor.resizeDrag = null;
  clearMoveGuide();
  delete document.body.dataset.editing;
  renderResizeHandles();
}

/** Отрисовка маркеров границ цитаты в DjVu. */
export function renderResizeHandles(): void {
  document.querySelectorAll(`.${NOTE_HANDLE_CLASS}`).forEach((handle) => handle.remove());
  if (!editor.editing || editor.editing.mode !== 'resize' || !editor.resizeDrag) {
    return;
  }
  const drag = editor.resizeDrag;
  const rects = drag.draft || (drag.anchor ? drag.anchor.rects : null);
  const { overlay, pageEl } =
    drag.pageEl && drag.pageEl.isConnected
      ? { pageEl: drag.pageEl, overlay: overlayOf(drag.pageEl) }
      : locateNote(drag.note.id);
  if (!overlay || !pageEl) {
    return;
  }
  const edges = edgeRects(rects);
  if (!edges) {
    return;
  }
  const bounds = pageEl.getBoundingClientRect();
  const place = (edge: string, rect: import('./types').Rect, x: number): void => {
    const handle = document.createElement('div');
    handle.className = NOTE_HANDLE_CLASS;
    handle.dataset.noteHandle = edge;
    handle.style.left = x - bounds.left + 'px';
    handle.style.top = rect.y * bounds.height + (rect.height * bounds.height) / 2 + 'px';
    overlay.appendChild(handle);
  };
  place('start', edges.first, bounds.left + edges.first.x * bounds.width);
  place(
    'end',
    edges.last,
    bounds.left + (edges.last.x + edges.last.width) * bounds.width,
  );
}
