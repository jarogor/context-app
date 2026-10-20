/** Жесты создания, перемещения и правки заметок.
 *
 * Обработчики указателя: протяжка фигуры инструментом «фигура», тяга перемещения
 * карточки или фигуры, тяга границ цитаты по тексту. Завершение жеста создаёт
 * фигуру или точку текстовой карточки; всё остальное — сообщения оболочке.
 */
import { caretAtPoint, rangeBetweenCarets } from './carets';
import { overlayOf, pagesEl, scrollProgress } from './dom';
import { editor, type ResizeDrag, type ShapeDrag } from './editing-state';
import { tileLineRects } from './lines';
import {
  closeNoteMenu,
  openNoteMenu,
  placeNote,
  redrawAllNotes,
  renderResizeHandles,
  showMoveGuide,
} from './note-ops';
import { noteById } from './notes';
import { post } from './protocol';
import { fractionRect, renderSelection, selectionQuote } from './selection';
import { state } from './state';
import type { NoteAnchor, Rect } from './types';

/** Доли точки внутри страницы по координатам указателя. */
export function pointFraction(
  pageEl: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const bounds = pageEl.getBoundingClientRect();
  const x = bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0;
  const y = bounds.height > 0 ? (clientY - bounds.top) / bounds.height : 0;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

/** Страница под координатами указателя. */
export function pageAt(clientX: number, clientY: number): HTMLElement | null {
  const element = document.elementFromPoint(clientX, clientY);
  return element && element.closest ? (element.closest('.page') as HTMLElement | null) : null;
}

/** Якорь-точка на странице (для фигуры или текстовой карточки). */
function pointAnchor(pageEl: HTMLElement, x: number, y: number): NoteAnchor {
  return {
    v: 1,
    kind: 'point',
    chapter: 0,
    start: 0,
    end: 0,
    quote: '',
    percent: scrollProgress(),
    page: Number(pageEl.dataset.page),
    x,
    y,
  };
}

/** Страница заметки по её идентификатору. */
function locateNotePage(noteId: string): HTMLElement | null {
  const element = document.querySelector(`[data-note-id="${noteId}"]`);
  return element ? (element.closest('.page') as HTMLElement | null) : null;
}

/** Начало тяги перемещения заметки (карточки или фигуры). */
function beginMoveDrag(event: PointerEvent): boolean {
  const drag = editor.moveDrag;
  if (!drag) {
    return false;
  }
  const pageEl = locateNotePage(drag.note.id);
  if (!pageEl) {
    return false;
  }
  const bounds = pageEl.getBoundingClientRect();
  drag.startX = event.clientX;
  drag.startY = event.clientY;
  drag.width = bounds.width;
  drag.height = bounds.height;
  drag.pointerId = event.pointerId;
  try {
    pagesEl.setPointerCapture(event.pointerId);
  } catch (error) {
    /* Захват указателя может быть недоступен — не критично. */
  }
  event.preventDefault();
  return true;
}

/** Обновление перемещения заметки: живой сдвиг её элемента. */
function moveNoteDrag(event: PointerEvent): void {
  const drag = editor.moveDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const width = drag.width || 0;
  const height = drag.height || 0;
  const dx = width > 0 ? (event.clientX - (drag.startX || 0)) / width : 0;
  const dy = height > 0 ? (event.clientY - (drag.startY || 0)) / height : 0;
  const anchor = drag.anchor;
  drag.draftAnchor = {
    ...anchor,
    x: Math.max(0, Math.min(1, (anchor.x || 0) + dx)),
    y: Math.max(0, Math.min(1, (anchor.y || 0) + dy)),
  };
  if (drag.geometry) {
    const geometry = drag.geometry;
    drag.draftGeometry = JSON.stringify({
      x1: Math.max(0, Math.min(1, geometry.x1 + dx)),
      y1: Math.max(0, Math.min(1, geometry.y1 + dy)),
      x2: Math.max(0, Math.min(1, geometry.x2 + dx)),
      y2: Math.max(0, Math.min(1, geometry.y2 + dy)),
    });
  }
  redrawAllNotes(state.notes);
  if (editor.moveGuide) {
    showMoveGuide();
  }
}

/** Завершение перемещения заметки: сохранение нового места. */
function finishMoveDrag(event: PointerEvent): boolean {
  const drag = editor.moveDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return false;
  }
  editor.moveDrag = null;
  editor.editing = null;
  clearMoveGuide();
  delete document.body.dataset.editing;
  const anchor = drag.draftAnchor || drag.anchor;
  placeNote(state.notes, drag.note, anchor, drag.draftGeometry);
  editor.clickSuppress = true;
  return true;
}

/** Снятие направляющих перемещения. */
function clearMoveGuide(): void {
  if (editor.moveGuide) {
    editor.moveGuide.remove();
    editor.moveGuide = null;
  }
}

/** Начало тяги границы цитаты в DjVu. */
function beginResizeDrag(event: PointerEvent, edge: string): void {
  const drag = editor.resizeDrag;
  if (!drag) {
    return;
  }
  drag.edge = edge === 'end' ? 'end' : 'start';
  drag.pointerId = event.pointerId;
  try {
    pagesEl.setPointerCapture(event.pointerId);
  } catch (error) {
    /* Захват указателя может быть недоступен — не критично. */
  }
  event.preventDefault();
  event.stopPropagation();
}

/** Обновление границы цитаты: конец выделения переносится к символу под курсором.
 *
 * Прямоугольники не тянутся напрямую: по указателю находится позиция каретки в
 * текстовом слое, из пары кареток строится диапазон, а прямоугольники и текст
 * берутся из него. Так границы цитаты двигаются по тексту.
 */
function moveResizeDrag(event: PointerEvent): void {
  const drag: ResizeDrag | null = editor.resizeDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const pageEl = drag.pageEl;
  if (!pageEl || !drag.startCaret || !drag.endCaret) {
    return;
  }
  const caret = caretAtPoint(pageEl, event.clientX, event.clientY);
  if (!caret) {
    return;
  }
  if (drag.edge === 'start') {
    drag.startCaret = caret;
  } else {
    drag.endCaret = caret;
  }
  const range = rangeBetweenCarets(drag.startCaret, drag.endCaret);
  if (!range) {
    return;
  }
  const pageBounds = pageEl.getBoundingClientRect();
  const rects: Rect[] = [];
  for (const bounds of range.getClientRects()) {
    if (bounds.width <= 0 || bounds.height <= 0) {
      continue;
    }
    rects.push(fractionRect(bounds, pageBounds));
  }
  if (rects.length === 0) {
    return;
  }
  drag.draft = tileLineRects(rects);
  drag.draftQuote = range.toString().replace(/\s+/g, ' ').trim();
  redrawAllNotes(state.notes);
  renderResizeHandles();
}

/** Завершение тяги границы цитаты: сохранение новых прямоугольников и текста. */
function finishResizeDrag(event: PointerEvent): boolean {
  const drag: ResizeDrag | null = editor.resizeDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return false;
  }
  editor.resizeDrag = null;
  editor.editing = null;
  delete document.body.dataset.editing;
  if (drag.draft) {
    const anchor: NoteAnchor = { ...drag.anchor, rects: drag.draft };
    if (drag.draftQuote) {
      anchor.quote = drag.draftQuote;
    }
    placeNote(state.notes, drag.note, anchor);
  }
  renderResizeHandles();
  editor.clickSuppress = true;
  return true;
}

/** Начало протяжки фигуры: запоминается первая точка и предпросмотр. */
function startShapeDrag(event: PointerEvent): void {
  if (editor.moveDrag && beginMoveDrag(event)) {
    return;
  }
  if (editor.resizeDrag) {
    const handle =
      event.target instanceof Element ? event.target.closest('[data-note-handle]') : null;
    if (handle instanceof HTMLElement) {
      beginResizeDrag(event, handle.dataset.noteHandle || 'start');
    }
    return;
  }
  /* Клик по пункту меню заметки не начинает рисование: иначе кнопки меню (особенно
     «Переместить») не срабатывали, а указатель захватывался протяжкой. */
  if (event.target instanceof Element && event.target.closest('.note-menu')) {
    return;
  }
  // Клик по существующей заметке не создаёт новую.
  const onNote = event.target instanceof Element ? event.target.closest('[data-note-id]') : null;
  if (onNote) {
    return;
  }
  if (state.tool.type !== 'shape' || event.button !== 0) {
    return;
  }
  const pageEl = pageAt(event.clientX, event.clientY);
  const overlay = pageEl ? overlayOf(pageEl) : null;
  if (!pageEl || !overlay) {
    return;
  }
  const start = pointFraction(pageEl, event.clientX, event.clientY);
  const preview = document.createElement('div');
  preview.className = 'note-preview';
  overlay.appendChild(preview);
  const drag: ShapeDrag = {
    pageEl,
    start,
    current: { ...start },
    preview,
    pointerId: event.pointerId,
  };
  editor.shapeDrag = drag;
  try {
    pagesEl.setPointerCapture(event.pointerId);
  } catch (error) {
    /* Захват указателя может быть недоступен — не критично. */
  }
  event.preventDefault();
}

/** Обновление предпросмотра во время протяжки. */
function moveShapeDrag(event: PointerEvent): void {
  const drag = editor.shapeDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const current = pointFraction(drag.pageEl, event.clientX, event.clientY);
  drag.current = current;
  const { start, preview } = drag;
  preview.style.left = Math.min(start.x, current.x) * 100 + '%';
  preview.style.top = Math.min(start.y, current.y) * 100 + '%';
  preview.style.width = Math.abs(current.x - start.x) * 100 + '%';
  preview.style.height = Math.abs(current.y - start.y) * 100 + '%';
}

/** Завершение жеста: создание фигуры или точки текстовой карточки. */
export function finishGesture(event: PointerEvent): void {
  if (finishMoveDrag(event)) {
    return;
  }
  if (finishResizeDrag(event)) {
    return;
  }
  const shape = editor.shapeDrag;
  if (shape && event.pointerId === shape.pointerId) {
    const { pageEl, start, current, preview } = shape;
    editor.shapeDrag = null;
    preview.remove();
    const moved =
      Math.abs(current.x - start.x) > 0.005 || Math.abs(current.y - start.y) > 0.005;
    if (moved) {
      post({
        type: 'shape',
        value: {
          anchor: pointAnchor(pageEl, start.x, start.y),
          shape: state.tool.shape,
          geometry: JSON.stringify({ x1: start.x, y1: start.y, x2: current.x, y2: current.y }),
          color: state.tool.color,
        },
      });
    }
    return;
  }
  if (state.tool.type === 'text' && event.button === 0) {
    /* Клик по пункту меню заметки (в том числе «Переместить») не создаёт карточку:
       кнопка меню не является частью элемента заметки. */
    if (event.target instanceof Element && event.target.closest('.note-menu')) {
      return;
    }
    const onNote = event.target instanceof Element ? event.target.closest('[data-note-id]') : null;
    if (onNote) {
      return;
    }
    const pageEl = pageAt(event.clientX, event.clientY);
    if (!pageEl) {
      return;
    }
    const point = pointFraction(pageEl, event.clientX, event.clientY);
    post({
      type: 'text-point',
      value: { anchor: pointAnchor(pageEl, point.x, point.y), color: state.tool.color },
    });
  }
}

/** Инструмент не «цитата»: выделение текста не начинается. */export function handlePointerDown(event: PointerEvent): void {
  if (editor.editing) {
    return;
  }
  if (state.tool.type !== 'quote') {
    event.preventDefault();
  }
}

/** Отправка текущего выделения приложению под инструментом «цитата». */
export function handleSelection(): void {
  const quote = selectionQuote();
  if (!quote) {
    return;
  }
  post({
    type: 'selection',
    value: {
      anchor: {
        v: 1,
        kind: 'page',
        chapter: 0,
        start: 0,
        end: 0,
        quote: quote.quote,
        percent: scrollProgress(),
        page: Number(quote.pageEl.dataset.page),
        rects: quote.rects,
      },
      x: quote.position.x,
      y: quote.position.y,
    },
  });
}

/** Выделение цитаты выполняется только инструментом «цитата». */
export function handleSelectionOrGesture(): void {
  if (editor.editing) {
    return;
  }
  if (state.tool.type === 'quote') {
    handleSelection();
  }
}

/** Снятие меню при пропаже выделения и перерисовка слоя выделения. */
export function handleSelectionChange(): void {
  // Слой выделения ведётся по текущему выделению: он перерисовывается на каждое
  // изменение, поэтому при снятии выделения слой исчезает.
  renderSelection();
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    post({ type: 'selection-cleared' });
  }
}

/** Обработка движения указателя: тяга заметки, границы или протяжка фигуры. */
export function handlePointerMove(event: PointerEvent): void {
  if (editor.moveDrag) {
    moveNoteDrag(event);
  } else if (editor.resizeDrag) {
    moveResizeDrag(event);
  } else {
    moveShapeDrag(event);
  }
}

/** Обработка нажатия по страницам: протяжка фигуры и тяги заметок. */
export function handlePagesPointerDown(event: PointerEvent): void {
  startShapeDrag(event);
}

/** Клик по заметке: приложение выбирает её, а вьюер показывает меню действий. */
export function handlePagesClick(event: MouseEvent): void {
  if (editor.clickSuppress) {
    editor.clickSuppress = false;
    return;
  }
  const target = event.target;
  const element =
    target instanceof Element && target.closest ? target.closest('[data-note-id]') : null;
  // Заметка-фигура — SVG, поэтому идентификатор берётся у любого элемента с
  // атрибутом, а не только у HTML-элемента.
  const noteId = element instanceof Element ? element.getAttribute('data-note-id') : null;
  if (!element || !noteId) {
    closeNoteMenu();
    return;
  }
  post({ type: 'note-click', value: { noteId } });
  const note = noteById(state.notes, noteId);
  if (note) {
    openNoteMenu(note, element);
  }
}
