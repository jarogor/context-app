/** Отрисовка заметок всех типов на страницах книги.
 *
 * Цитаты рисуются подсветкой по полосам строк, текстовые карточки — наложением
 * текста в месте якоря, фигуры — SVG своего вида. Цвет берётся мягким тоном
 * заметки из темы области чтения.
 */
import { NOTE_CARD_CLASS, NOTE_CLASS, NOTE_SHAPE_CLASS, overlayOf } from './dom';
import { editor } from './editing-state';
import { parseGeometry, shapeElement, shapeHitElement } from './geometry';
import { tileLineRects } from './lines';
import { noteColor } from './theme';
import type { NoteAnchor, ViewerNote } from './types';

/** Разбор якоря заметки; повреждённая строка даёт null. */
export function anchorOf(note: ViewerNote | null | undefined): NoteAnchor | null {
  if (!note || !note.anchor) {
    return null;
  }
  try {
    return JSON.parse(note.anchor) as NoteAnchor;
  } catch (error) {
    return null;
  }
}

/** Заметка по идентификатору из локального списка. */
export function noteById(notes: ViewerNote[], noteId: string): ViewerNote | null {
  return notes.find((note) => note.id === noteId) || null;
}

/** Наложение текстовой карточки по точке её якоря на странице. */
function drawTextCard(overlay: Element, note: ViewerNote, anchor: NoteAnchor): void {
  const element = document.createElement('div');
  element.className = NOTE_CARD_CLASS;
  element.dataset.noteId = note.id;
  element.style.left = (anchor.x ?? 0) * 100 + '%';
  element.style.top = (anchor.y ?? 0) * 100 + '%';
  // Карточка окрашена тем же мягким тоном, что цитата и фигура.
  element.style.background = noteColor(note.color);
  element.textContent = note.text || '';
  overlay.appendChild(element);
}

/** Наложение фигуры по её виду и геометрии на странице. */
function drawShape(
  overlay: Element,
  note: ViewerNote,
  geometryValue: string | undefined,
): void {
  const geometry = parseGeometry(geometryValue ?? note.geometry);
  if (!geometry) {
    return;
  }
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('class', NOTE_SHAPE_CLASS);
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.dataset.noteId = note.id;
  const color = noteColor(note.color);
  const shape = note.shape || 'line';
  const element = shapeElement(shape, geometry);
  if (shape === 'line') {
    // Линия — толстый полупрозрачный штрих: заливки у неё нет.
    element.setAttribute('stroke', color);
    element.setAttribute('stroke-width', '4');
    element.setAttribute('fill', 'none');
  } else {
    // Прямоугольник и эллипс — мягкая заливка без обводки, как цитата.
    element.setAttribute('fill', color);
    element.setAttribute('stroke', 'none');
  }
  svg.appendChild(element);
  // Прозрачная мишень по всей фигуре: попасть по тонкому штриху сложно.
  const hit = shapeHitElement(shape, geometry);
  hit.setAttribute('class', 'note-shape-hit');
  svg.appendChild(hit);
  overlay.appendChild(svg);
}

/** Подсветка заметок и наложения карточек и фигур на странице. */
export function drawNotes(pageEl: HTMLElement, notes: ViewerNote[]): void {
  const overlay = overlayOf(pageEl);
  if (!overlay) {
    return;
  }
  // Слой фигур сохраняется: во время протяжки по нему ведётся предпросмотр,
  // а замена содержимого разрушила бы захваченный указатель.
  overlay
    .querySelectorAll(`.${NOTE_CLASS}, .${NOTE_CARD_CLASS}, .${NOTE_SHAPE_CLASS}`)
    .forEach((element) => element.remove());
  const index = Number(pageEl.dataset.page);
  for (const note of notes) {
    if (!note.anchor) {
      continue;
    }
    let anchor: NoteAnchor | null;
    try {
      anchor = JSON.parse(note.anchor) as NoteAnchor;
    } catch (error) {
      continue;
    }
    // Черновик перемещения или сдвига границ подменяет сохранённое место.
    let geometry = note.geometry;
    let rects = anchor.rects || [];
    if (editor.moveDrag && editor.moveDrag.note.id === note.id) {
      anchor = editor.moveDrag.draftAnchor || anchor;
      geometry = editor.moveDrag.draftGeometry || geometry;
    }
    if (editor.resizeDrag && editor.resizeDrag.note.id === note.id && editor.resizeDrag.draft) {
      rects = editor.resizeDrag.draft;
    }
    // Цитаты привязаны к странице, карточки и фигуры — к точке на ней.
    if (!anchor || anchor.page !== index) {
      continue;
    }
    const type = note.type || 'quote';
    if (type === 'text' && anchor.kind === 'point') {
      drawTextCard(overlay, note, anchor);
    } else if (type === 'shape' && anchor.kind === 'point') {
      drawShape(overlay, note, geometry);
    } else if (anchor.kind === 'page') {
      for (const rect of tileLineRects(rects)) {
        const element = document.createElement('div');
        element.className = NOTE_CLASS;
        element.dataset.noteId = note.id;
        element.style.background = noteColor(note.color);
        element.style.left = rect.x * 100 + '%';
        element.style.top = rect.y * 100 + '%';
        element.style.width = rect.width * 100 + '%';
        element.style.height = rect.height * 100 + '%';
        overlay.appendChild(element);
      }
    }
  }
}
