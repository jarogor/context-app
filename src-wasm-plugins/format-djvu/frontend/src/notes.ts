/** Отрисовка заметок всех типов на страницах книги.
 *
 * Цитаты рисуются подсветкой по полосам строк, текстовые карточки — наложением
 * текста в месте якоря, фигуры — SVG своего вида. Цвет берётся мягким тоном
 * заметки из темы области чтения.
 */
import {
  NOTE_CARD_CLASS,
  NOTE_CLASS,
  NOTE_RESIZE_DRAFT_CLASS,
  NOTE_SHAPE_CLASS,
  overlayOf,
} from './dom';
import { editor } from './editing-state';
import { parseGeometry, shapeElement, shapeHitElement } from './geometry';
import { tileLineRects } from './lines';
import { TEXT_LAYER_CLASS } from './dom';
import { state, type RenderedEntry } from './state';
import { highlightPair, parseTone } from './theme';
import type { NoteAnchor, Rect, ViewerNote } from './types';

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

/** Полосы живого выделения по страницам, в долях страницы.
 *
 * Заливка рисуется в растре страницы, а не слоем над текстом: полоса слоем
 * ложится плёнкой на буквы, и текст мутнеет — на тёмной стороне это особенно
 * заметно. Хранятся здесь, потому что здесь же и рисуются.
 */
const selectionBands = new Map<HTMLElement, Rect[]>();

/** Полосы живого выделения страницы, в долях страницы. */
export function selectionBandsOf(pageEl: HTMLElement): Rect[] {
  return selectionBands.get(pageEl) ?? [];
}

/** Совпадают ли полосы: тогда растр страницы не нужно перерисовывать. */
function sameBands(left: Rect[], right: Rect[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((rect, index) => {
    const other = right[index];
    return (
      rect.x === other.x &&
      rect.y === other.y &&
      rect.width === other.width &&
      rect.height === other.height
    );
  });
}

/** Участок растра, который нужно перерисовать после смены полос.
 *
 * Перерисовка всей страницы стоит около десяти миллисекунд (WebKit), а полосы
 * выделения меняются на каждом движении указателя — с такой ценой протяжка
 * тормозила бы. Достаточно перерисовать место, где полосы были и где стали.
 */
export interface BandsChange {
  /** Страница. */
  pageEl: HTMLElement;
  /** Участок в долях страницы; `null` — вся страница. */
  region: Rect | null;
}

/** Объединение полос в один прямоугольник, в долях страницы. */
function unionOf(bands: Rect[]): Rect {
  let x = Number.POSITIVE_INFINITY;
  let y = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of bands) {
    x = Math.min(x, rect.x);
    y = Math.min(y, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x, y, width: right - x, height: bottom - y };
}

/** Запись полос живого выделения страницы.
 *
 * Полосы живут только на одной странице: выделение не переходит через разрыв
 * между листами (оно живёт в одном текстовом слое), но прежние полосы со
 * страницы, где выделение было, нужно снять.
 *
 * Возвращает страницы, чей растр нужно перерисовать, и участок: их полосы
 * изменились. Неизменённые полосы перерисовки не требуют — на каждом движении
 * указателя это была бы лишняя работа.
 */
export function setSelectionBands(pageEl: HTMLElement, bands: Rect[] | null): BandsChange[] {
  const changed: BandsChange[] = [];
  for (const other of [...selectionBands.keys()]) {
    if (other !== pageEl) {
      const stale = selectionBands.get(other) ?? [];
      selectionBands.delete(other);
      if (stale.length > 0) {
        changed.push({ pageEl: other, region: unionOf(stale) });
      }
    }
  }
  const current = selectionBands.get(pageEl) ?? [];
  const next = bands ?? [];
  if (sameBands(current, next)) {
    return changed;
  }
  if (next.length === 0) {
    selectionBands.delete(pageEl);
  } else {
    selectionBands.set(pageEl, next);
  }
  const touched = [...current, ...next];
  changed.unshift({ pageEl, region: touched.length > 0 ? unionOf(touched) : null });
  return changed;
}

/** Снятие полос живого выделения со всех страниц и их прежние участки. */
export function clearSelectionBands(): BandsChange[] {
  const pages: BandsChange[] = [];
  for (const [pageEl, bands] of selectionBands) {
    if (bands.length > 0) {
      pages.push({ pageEl, region: unionOf(bands) });
    }
  }
  selectionBands.clear();
  return pages;
}

/** Участок канваса под участком страницы, в пикселях растра.
 *
 * Доли страницы переводятся в пиксели канваса так же, как полосы выделения:
 * через плотность растра и смещение окна страницы при сильном увеличении.
 * Пиксель запаса по краям убирает щель от округления долей.
 */
function canvasBox(
  region: Rect,
  canvas: HTMLCanvasElement,
  pageEl: HTMLElement,
  entry: RenderedEntry,
): { x: number; y: number; width: number; height: number } | null {
  const pageWidth = pageEl.clientWidth;
  const pageHeight = pageEl.clientHeight;
  if (!pageWidth || !pageHeight) {
    return null;
  }
  const ratioX = canvas.width / entry.info.width;
  const ratioY = canvas.height / entry.info.height;
  const offsetX = -entry.info.x * ratioX;
  const offsetY = -entry.info.y * ratioY;
  const left = Math.max(0, Math.floor(offsetX + region.x * pageWidth * ratioX) - 1);
  const top = Math.max(0, Math.floor(offsetY + region.y * pageHeight * ratioY) - 1);
  const right = Math.min(
    canvas.width,
    Math.ceil(offsetX + (region.x + region.width) * pageWidth * ratioX) + 1,
  );
  const bottom = Math.min(
    canvas.height,
    Math.ceil(offsetY + (region.y + region.height) * pageHeight * ratioY) + 1,
  );
  if (right <= left || bottom <= top) {
    return null;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Межстрочный шаг страницы в CSS-пикселях; 0 — шаг неизвестен.
 *
 * Шаг измерен слоем по всем строкам страницы (`data-line-pitch`) и не зависит
 * от состава выделения: полосы цитаты, как и живого выделения, должны идти по
 * строке, а не по высоте букв.
 */
function pageLinePitch(pageEl: HTMLElement): number {
  const layer = pageEl.querySelector<HTMLElement>(`.${TEXT_LAYER_CLASS}`);
  const value = layer ? Number.parseFloat(layer.dataset.linePitch ?? '') : Number.NaN;
  // Полосы цитат заданы долями страницы: шаг из CSS-пикселей приводится к ним.
  const height = pageEl.clientHeight;
  return Number.isFinite(value) && value > 0 && height > 0 ? value / height : 0;
}

/** Перерисовка растра страницы с подсветками цитат.
 *
 * Подсветка накладывается **в растре** (`multiply` на канвасе), а не слоем над
 * текстом: в WebKitGTK CSS-наложение не применяется, и непрозрачная подсветка
 * закрывала строку целиком. В канвасе умножение работает всегда, поэтому текст
 * остаётся прежним цветом, а бумага становится цветной.
 *
 * Кадр строится от чистой копии растра: повторная перерисовка не копит цвет.
 *
 * Правимая цитата в растр не попадает: при тяге границы растр перерисовывался
 * бы на каждое движение указателя (`getImageData`/`putImageData` всей полосы),
 * и страница мигала и тормозила. Её черновик рисуется слоем над текстом
 * (`drawResizeDraft`), а в растр она попадает по отпусканию.
 */
function paintHighlights(
  canvas: HTMLCanvasElement,
  entry: RenderedEntry,
  pageEl: HTMLElement,
  notes: ViewerNote[],
  region: Rect | null = null,
): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return;
  }
  context.globalCompositeOperation = 'source-over';
  // Кадр строится от чистой копии растра: рисуется вся страница или только
  // участок, который затронуло изменение полос.
  const box = region ? canvasBox(region, canvas, pageEl, entry) : null;
  if (box) {
    context.clearRect(box.x, box.y, box.width, box.height);
    context.drawImage(
      entry.base,
      box.x,
      box.y,
      box.width,
      box.height,
      box.x,
      box.y,
      box.width,
      box.height,
    );
  } else {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(entry.base, 0, 0);
  }

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

  /* Живое выделение — первым слоем, заметки поверх. Заливка рисуется здесь, в
     растре: полоса слоем над текстом ложится плёнкой на буквы, и текст мутнеет.
     Наложение делает канвас (`multiply` на светлой стороне, `screen` на тёмной):
     бумага получает тон, а буквы остаются прежними — на тёмной стороне `screen`
     не осветляет то, что ярче тона. Попиксельный цикл не нужен: он стоил около
     десяти миллисекунд на каждое движение указателя. */
  const selection = selectionBandsOf(pageEl);
  if (selection.length > 0) {
    const color = selectionColor();
    context.globalCompositeOperation = state.readerTheme === 'dark' ? 'screen' : 'multiply';
    context.fillStyle = color;
    for (const rect of selection) {
      context.fillRect(
        offsetX + rect.x * pageWidth * ratioX,
        offsetY + rect.y * pageHeight * ratioY,
        rect.width * pageWidth * ratioX,
        rect.height * pageHeight * ratioY,
      );
    }
    context.globalCompositeOperation = 'source-over';
  }

  for (const note of notes) {
    const anchor = anchorOf(note);
    if (!anchor || (note.type || 'quote') !== 'quote' || anchor.page !== index) {
      continue;
    }
    if (editor.resizeDrag && editor.resizeDrag.note.id === note.id) {
      continue;
    }
    for (const rect of tileLineRects(anchor.rects || [], pageLinePitch(pageEl))) {
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

/** Цвет живой полосы выделения: токен темы или запасной тон. */
function selectionColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--reader-selection')
    .trim();
  return value || 'rgba(37, 99, 235, 0.35)';
}

/** Наложение текстовой карточки по точке её якоря на странице. */
function drawTextCard(overlay: Element, note: ViewerNote, anchor: NoteAnchor): void {
  const element = document.createElement('div');
  element.className = NOTE_CARD_CLASS;
  element.dataset.noteId = note.id;
  element.style.left = (anchor.x ?? 0) * 100 + '%';
  element.style.top = (anchor.y ?? 0) * 100 + '%';
  // Карточка берёт ту же пару «заливка и подпись», что цитата и метка в
  // списке: цвет текста на карточке — цвет подписи метки, а не темы.
  const pair = highlightPair(note.color);
  element.style.background = pair.fill;
  element.style.color = pair.ink;
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
  // Фигура — тот же цвет, что заливка подсветки: заметка одного цвета
  // выглядит одинаково в любом своём виде.
  const color = highlightPair(note.color).fill;
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

/** Подпись уже нарисованного растра по странице.
 *
 * Перерисовка растра — это `clearRect` и `drawImage` всей страницы: на кадр она
 * делает страницу пустой, и текст моргает. Жест меняет только наложения: правимая
 * цитата рисуется черновиком слоем, карточка и фигура — тоже слоем. Пока подпись
 * та же (состав подсветок и тема), растр не трогается вовсе.
 */
const paintedSignature = new WeakMap<HTMLCanvasElement, string>();

/** Подпись подсветок страницы: что именно нарисовано в растре. */
function highlightSignature(pageEl: HTMLElement, notes: ViewerNote[]): string {
  const index = Number(pageEl.dataset.page);
  // Полосы живого выделения тоже рисуются в растре: их изменение — причина
  // перерисовать кадр, иначе выделение не появлялось бы до прокрутки.
  const parts: string[] = [
    String(state.readerTheme),
    JSON.stringify(selectionBandsOf(pageEl)),
  ];
  for (const note of notes) {
    if ((note.type || 'quote') !== 'quote') {
      continue;
    }
    // Правимая цитата в растре не рисуется: её показывает черновик слоем.
    if (editor.resizeDrag && editor.resizeDrag.note.id === note.id) {
      continue;
    }
    const anchor = anchorOf(note);
    if (!anchor || anchor.page !== index) {
      continue;
    }
    parts.push(`${note.id}:${note.color ?? ''}:${JSON.stringify(anchor.rects || [])}`);
  }
  return parts.join('|');
}

/** Подсветка заметок и наложения карточек и фигур на странице.
 *
 * `region` — участок страницы, который затронуло изменение: тогда растр
 * перерисовывается только в нём (см. `setSelectionBands`). `null` — вся страница.
 */
export function drawNotes(
  pageEl: HTMLElement,
  notes: ViewerNote[],
  region: Rect | null = null,
): void {
  const overlay = overlayOf(pageEl);
  if (!overlay) {
    return;
  }
  // Слой фигур сохраняется: во время протяжки по нему ведётся предпросмотр,
  // а замена содержимого разрушила бы захваченный указатель.
  overlay
    .querySelectorAll(
      `.${NOTE_CLASS}, .${NOTE_CARD_CLASS}, .${NOTE_SHAPE_CLASS}, .${NOTE_RESIZE_DRAFT_CLASS}`,
    )
    .forEach((element) => element.remove());
  const canvas = pageEl.querySelector('canvas') as HTMLCanvasElement | null;
  const entry = state.rendered.get(pageEl);
  if (canvas && entry) {
    const signature = highlightSignature(pageEl, notes);
    if (paintedSignature.get(canvas) !== signature) {
      paintHighlights(canvas, entry, pageEl, notes, region);
      paintedSignature.set(canvas, signature);
    }
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
      /* Правимая цитата рисуется черновиком слоем: в растр она попадает только
         по отпусканию маркера, иначе страница перерисовывалась бы на каждое
         движение указателя. */
      const resizing = editor.resizeDrag && editor.resizeDrag.note.id === note.id;
      if (resizing) {
        drawResizeDraft(overlay, note, rects, pageLinePitch(pageEl));
        continue;
      }
      for (const rect of tileLineRects(rects, pageLinePitch(pageEl))) {
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

/** Черновик правимой цитаты: полупрозрачные полосы поверх текста.
 *
 * Наложение умножением, как у подсветки: цвет берётся из темы области чтения,
 * а буквы остаются читаемыми. В растр черновик не пишется — там подсветка
 * появится по отпусканию, когда правка закончится.
 */
function drawResizeDraft(
  overlay: Element,
  note: ViewerNote,
  rects: Rect[],
  pitch: number,
): void {
  const pair = highlightPair(note.color);
  const layer = document.createElement('div');
  layer.className = NOTE_RESIZE_DRAFT_CLASS;
  layer.dataset.noteId = note.id;
  for (const rect of tileLineRects(rects, pitch)) {
    const element = document.createElement('div');
    element.className = 'note-resize-band';
    element.style.left = rect.x * 100 + '%';
    element.style.top = rect.y * 100 + '%';
    element.style.width = rect.width * 100 + '%';
    element.style.height = rect.height * 100 + '%';
    element.style.background = pair.fill;
    layer.appendChild(element);
  }
  overlay.appendChild(layer);
}
