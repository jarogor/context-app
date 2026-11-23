/** Отрисовка заметок всех типов на страницах книги.
 *
 * Цитаты рисуются подсветкой по полосам строк, текстовые карточки — наложением
 * текста в месте якоря, фигуры — SVG своего вида. Цвет берётся мягким тоном
 * заметки из темы области чтения.
 */
import {
  NOTE_CARD_CLASS,
  NOTE_CLASS,
  NOTE_SHAPE_CLASS,
  overlayOf,
} from './dom';
import { editor } from './editing-state';
import { parseGeometry, shapeElement, shapeHitElement } from './geometry';
import { tileLineRects } from './lines';
import { state, type RenderedEntry } from './state';
import { highlightPair, noteColor, parseTone } from './theme';
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

/** Перерисовка растра страницы с подсветками цитат.
 *
 * Подсветка накладывается **в растре** (`multiply` на канвасе), а не слоем над
 * текстом: в WebKitGTK CSS-наложение не применяется, и непрозрачная подсветка
 * закрывала строку целиком. В канвасе умножение работает всегда, поэтому текст
 * остаётся прежним цветом, а бумага становится цветной.
 *
 * Кадр строится от чистой копии растра: повторная перерисовка не копит цвет.
 */
function paintHighlights(
  canvas: HTMLCanvasElement,
  entry: RenderedEntry,
  pageEl: HTMLElement,
  notes: ViewerNote[],
): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return;
  }
  context.globalCompositeOperation = 'source-over';
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(entry.base, 0, 0);

  const index = Number(pageEl.dataset.page);
  const pageWidth = pageEl.clientWidth;
  const pageHeight = pageEl.clientHeight;
  if (!pageWidth || !pageHeight) {
    return;
  }
  const ratioX = canvas.width / entry.info.width;
  const ratioY = canvas.height / entry.info.height;
  const offsetX = -entry.info.x * ratioX;
  const offsetY = -entry.info.y * ratioY;

  for (const note of notes) {
    const anchor = anchorOf(note);
    if (!anchor || (note.type || 'quote') !== 'quote' || anchor.page !== index) {
      continue;
    }
    const rects =
      editor.resizeDrag && editor.resizeDrag.note.id === note.id && editor.resizeDrag.draft
        ? editor.resizeDrag.draft
        : anchor.rects || [];
    for (const rect of tileLineRects(rects)) {
      const x = offsetX + rect.x * pageWidth * ratioX;
      const y = offsetY + rect.y * pageHeight * ratioY;
      const width = rect.width * pageWidth * ratioX;
      const height = rect.height * pageHeight * ratioY;
      // Участок перекрашивается в пару «заливка и подпись» метки заметки:
      // бумага становится заливкой, буквы — цветом подписи. Подсветка на
      // странице и метка в списке читаются одним цветом, а текст под ней
      // остаётся читаемым: у синего подпись светлая, у жёлтого и красного —
      // тёмная, как в лейблах.
      const pair = highlightPair(note.color);
      const source = state.readerTheme === 'dark' ? entry.light : entry.base;
      paintDuotone(context, source, x, y, width, height, pair.fill, pair.ink);
    }
  }
  context.globalCompositeOperation = 'source-over';
}

/** Перекраска участка страницы в пару «заливка и подпись».
 *
 * Заливка ложится на бумагу, а буквы получают цвет подписи: яркость исходного
 * пикселя задаёт долю между ними. Так подсветка точно совпадает с меткой
 * заметки, а текст под ней остаётся того же цвета, что у метки. Работает в
 * самом растре, потому что CSS-наложение в WebKitGTK не применяется.
 */
function paintDuotone(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  ink: string,
): void {
  const fillColor = parseTone(fill);
  const inkColor = parseTone(ink);
  const box = {
    x: Math.max(0, Math.floor(x)),
    y: Math.max(0, Math.floor(y)),
    width: Math.max(1, Math.ceil(width)),
    height: Math.max(1, Math.ceil(height)),
  };
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!fillColor || !inkColor || !sourceContext) {
    return;
  }
  let image: ImageData;
  try {
    image = sourceContext.getImageData(box.x, box.y, box.width, box.height);
  } catch (error) {
    return;
  }
  const data = image.data;
  for (let offset = 0; offset < data.length; offset += 4) {
    // Яркость исходного пикселя: тёмные буквы дают единицу, бумага — ноль.
    const darkness =
      1 - (0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]) / 255;
    data[offset] = Math.round(fillColor.r + (inkColor.r - fillColor.r) * darkness);
    data[offset + 1] = Math.round(fillColor.g + (inkColor.g - fillColor.g) * darkness);
    data[offset + 2] = Math.round(fillColor.b + (inkColor.b - fillColor.b) * darkness);
    data[offset + 3] = 255;
  }
  context.putImageData(image, box.x, box.y);
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
  const canvas = pageEl.querySelector('canvas') as HTMLCanvasElement | null;
  const entry = state.rendered.get(pageEl);
  if (canvas && entry) {
    paintHighlights(canvas, entry, pageEl, notes);
  }
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
        element.style.left = rect.x * 100 + '%';
        element.style.top = rect.y * 100 + '%';
        element.style.width = rect.width * 100 + '%';
        element.style.height = rect.height * 100 + '%';
        overlay.appendChild(element);
      }
    }
  }
}
