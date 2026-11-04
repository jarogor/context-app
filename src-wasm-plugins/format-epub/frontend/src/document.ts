/** Документ книги: разметка глав и оформление области чтения.
 *
 * Модуль собирает документ внутри песочницы: главы приходят от приложения
 * готовым HTML (разбор формата — дело плагина WASM), а оформление задаётся
 * CSS-переменными, которые приложение присылает сообщением `reader-theme`.
 * Собственных значений темы у плагина нет: палитра и сторона принадлежат
 * приложению.
 */

import type { BookContent } from './types';
import { FOOTNOTE_BACK_CLASS } from './footnote';
import { SEARCH_ACTIVE_CLASS, SEARCH_CLASS } from './search-mark';

/** Класс раздела главы книги. */
export const CHAPTER_CLASS = 'context-chapter';
/** Класс подсветки заметки-цитаты. */
export const NOTE_CLASS = 'context-note';
/** Класс временной вспышки подсветки при переходе к заметке. */
export const FLASH_CLASS = 'context-note-flash';
/** Класс временной подсветки маркера сноски при возврате к месту чтения. */
export const FOOTNOTE_FLASH_CLASS = 'context-footnote-flash';
/** Класс превью подсветки при правке границ цитаты. */
export const NOTE_PREVIEW_CLASS = 'context-resize-preview';
/** Класс слоя активного выделения текста. */
export const SELECTION_LAYER_CLASS = 'context-selection-layer';
/** Класс полосы активного выделения. */
export const SELECTION_BAND_CLASS = 'context-selection-band';
/** Отступ сверху до опорной строки при масштабировании, в пикселях. */
export const ZOOM_ANCHOR_MARGIN = 18;

/** Оформление документа: то, что не зависит от палитры и стороны темы. */
const BASE_STYLE = [
  'html{font-size:100%;position:relative;}',
  // Поля и ширина колонки принадлежат читалке, а не книге: `!important`
  // защищает каркас от издательских правил, которые всё же доходят до `body`.
  'body{margin:0 auto !important;width:100% !important;',
  'max-width:48rem !important;padding:1.5rem 2rem !important;box-sizing:border-box;}',
  'body{background:var(--rt-background);color:var(--rt-foreground);line-height:1.6;',
  'font-family:var(--rt-font);}',
  // Типографика книги: правила слабые (в `em`), чтобы следовать за масштабом.
  'img{max-width:100%;height:auto;}',
  'h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.4em 0 0.6em;font-weight:600;}',
  'h1{font-size:1.8em;}',
  'h2{font-size:1.5em;}',
  'h3{font-size:1.3em;}',
  'h4{font-size:1.15em;}',
  'h5,h6{font-size:1em;}',
  'p{margin:0.7em 0;text-align:justify;hyphens:auto;}',
  'h1+p,h2+p,h3+p,h4+p,h5+p,h6+p{text-indent:0;}',
  'blockquote{margin:1em 0 1em 1.5em;padding-left:1em;',
  'border-left:2px solid var(--rt-muted);color:var(--rt-muted);font-style:italic;}',
  'ul,ol{margin:0.8em 0;padding-left:1.6em;}',
  'li{margin:0.3em 0;}',
  'hr{border:0;border-top:1px solid var(--rt-muted);margin:1.6em 0;}',
  'table{border-collapse:collapse;margin:1em 0;max-width:100%;}',
  'td,th{padding:0.3em 0.6em;border:1px solid var(--rt-muted);}',
  'pre{white-space:pre-wrap;overflow-wrap:break-word;}',
  'code,kbd,pre{font-family:ui-monospace,monospace;font-size:0.92em;}',
  'sup,sub{line-height:0;}',
  'a{color:var(--rt-link);}',
  'small,figcaption{color:var(--rt-muted);font-size:0.9em;}',
  'figure{margin:1em 0;}',
  // Под инструментами «текст» и «фигура» протяжка не выделяет текст.
  'body[data-tool="text"],body[data-tool="shape"]{cursor:crosshair;user-select:none;}',
  'body[data-tool="text"] *,body[data-tool="shape"] *{cursor:crosshair;}',
  // Клик по существующей заметке открывает её меню: курсор это показывает.
  'body[data-tool="text"] .context-note-card,body[data-tool="shape"] .context-note-card,',
  'body[data-tool="text"] mark.context-note,body[data-tool="shape"] mark.context-note,',
  'body[data-tool="text"] .context-note-shape path,body[data-tool="shape"] .context-note-shape path',
  '{cursor:pointer !important;}',
  // Заливку выделения рисует собственный слой: движки красят `::selection`
  // по-разному, и своя полоса не совпала бы с нативной.
  '::selection{background:transparent;}',
  `.${SELECTION_LAYER_CLASS}{position:absolute;left:0;top:0;pointer-events:none;z-index:1;`,
  'mix-blend-mode:multiply;}',
  `html[data-reader-theme='dark'] .${SELECTION_LAYER_CLASS}{mix-blend-mode:screen;}`,
  `.${SELECTION_BAND_CLASS}{position:absolute;border-radius:2px;background:var(--rt-selection);}`,
  `.${SELECTION_BAND_CLASS}::before,.${SELECTION_BAND_CLASS}::after{content:none;position:absolute;`,
  'top:-0.5px;bottom:-0.5px;width:var(--rt-selection-edge-width,1px);',
  'background:var(--rt-selection-edge);border-radius:calc(0.5 * var(--rt-selection-edge-width,1px));}',
  `.${SELECTION_BAND_CLASS}[data-edge="start"]::before,`,
  `.${SELECTION_BAND_CLASS}[data-edge="both"]::before{content:"";`,
  'left:calc(-0.5 * var(--rt-selection-edge-width,1px));}',
  `.${SELECTION_BAND_CLASS}[data-edge="end"]::after,`,
  `.${SELECTION_BAND_CLASS}[data-edge="both"]::after{content:"";`,
  'right:calc(-0.5 * var(--rt-selection-edge-width,1px));}',
  `.${NOTE_CLASS}{border-radius:2px;cursor:pointer;color:inherit;`,
  'box-decoration-break:clone;-webkit-box-decoration-break:clone;}',
  `.${NOTE_CLASS}[data-color="yellow"]{background:var(--note-solid-yellow);}`,
  `.${NOTE_CLASS}[data-color="green"]{background:var(--note-solid-green);}`,
  `.${NOTE_CLASS}[data-color="blue"]{background:var(--note-solid-blue);}`,
  `.${NOTE_CLASS}[data-color="red"]{background:var(--note-solid-red);}`,
  `.${NOTE_CLASS}[data-color="purple"]{background:var(--note-solid-purple);}`,
  `.${CHAPTER_CLASS}{position:relative;}`,
  '.context-note-card{position:absolute;max-width:220px;padding:6px 8px;border-radius:6px;',
  'font-size:13px;line-height:1.4;white-space:pre-wrap;cursor:pointer;z-index:2;}',
  '.context-note-card[data-color="yellow"]{background:var(--note-yellow);}',
  '.context-note-card[data-color="green"]{background:var(--note-green);}',
  '.context-note-card[data-color="blue"]{background:var(--note-blue);}',
  '.context-note-card[data-color="red"]{background:var(--note-red);}',
  '.context-note-card[data-color="purple"]{background:var(--note-purple);}',
  '.context-note-shape{position:absolute;pointer-events:none;overflow:visible;',
  'mix-blend-mode:multiply;}',
  '.context-note-shape rect,.context-note-shape ellipse{stroke:none;fill-opacity:0.5;',
  'vector-effect:non-scaling-stroke;pointer-events:none;}',
  '.context-note-shape line{fill:none;stroke-width:4;stroke-opacity:0.6;',
  'vector-effect:non-scaling-stroke;pointer-events:none;}',
  '.context-note-shape path{fill:transparent;stroke:transparent;stroke-width:16;',
  'vector-effect:non-scaling-stroke;pointer-events:all;cursor:pointer;}',
  '.context-note-preview{position:absolute;z-index:3;pointer-events:none;',
  'border:1px dashed #2563eb;box-sizing:border-box;}',
  '.context-note-preview::before{content:"";position:absolute;left:0;right:0;top:50%;',
  'height:1px;background:#2563eb;opacity:0.6;}',
  '.context-note-preview::after{content:"";position:absolute;top:0;bottom:0;left:50%;',
  'width:1px;background:#2563eb;opacity:0.6;}',
  '.context-note-shape[data-color="yellow"] rect,',
  '.context-note-shape[data-color="yellow"] ellipse{fill:var(--note-yellow);}',
  '.context-note-shape[data-color="yellow"] line{stroke:var(--note-yellow);}',
  '.context-note-shape[data-color="green"] rect,',
  '.context-note-shape[data-color="green"] ellipse{fill:var(--note-green);}',
  '.context-note-shape[data-color="green"] line{stroke:var(--note-green);}',
  '.context-note-shape[data-color="blue"] rect,',
  '.context-note-shape[data-color="blue"] ellipse{fill:var(--note-blue);}',
  '.context-note-shape[data-color="blue"] line{stroke:var(--note-blue);}',
  '.context-note-shape[data-color="red"] rect,',
  '.context-note-shape[data-color="red"] ellipse{fill:var(--note-red);}',
  '.context-note-shape[data-color="red"] line{stroke:var(--note-red);}',
  '.context-note-shape[data-color="purple"] rect,',
  '.context-note-shape[data-color="purple"] ellipse{fill:var(--note-purple);}',
  '.context-note-shape[data-color="purple"] line{stroke:var(--note-purple);}',
  `.${NOTE_CLASS}.${FLASH_CLASS}{background:#f59e0b;}`,
  `.${NOTE_CLASS}.${SEARCH_ACTIVE_CLASS}{background:var(--rt-search-active);}`,
  `.${SEARCH_CLASS}{border-radius:2px;background:var(--rt-search);`,
  'color:inherit;box-decoration-break:clone;-webkit-box-decoration-break:clone;}',
  `.${SEARCH_CLASS}.${SEARCH_ACTIVE_CLASS}{background:var(--rt-search-active);}`,
  `.context-overlay.${FLASH_CLASS}{opacity:0.4;}`,
  `.${FOOTNOTE_FLASH_CLASS}{background:#f59e0b;border-radius:2px;}`,
  `.${FOOTNOTE_BACK_CLASS}{font-size:0.85em;margin-left:0.35em;text-decoration:none;`,
  'vertical-align:super;line-height:0;opacity:0.65;}',
  `.${FOOTNOTE_BACK_CLASS}:hover{opacity:1;}`,
  'body[data-editing="move"]{cursor:move;}',
  'body[data-editing="move"] .context-overlay{cursor:move;}',
  'body[data-editing="resize"],body[data-editing="resize"] *{cursor:ew-resize;}',
  '.context-note-handle{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;',
  'border-radius:50%;background:#1d4ed8;border:2px solid #fff;',
  'box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:ew-resize;z-index:5;}',
  `.${NOTE_PREVIEW_CLASS}{position:absolute;pointer-events:none;opacity:0.45;z-index:1;}`,
].join('');

/** Оформление документа книги: типографика и разметка заметок. */
export function bookStyle(): string {
  return BASE_STYLE;
}

/** Сборка документа книги из глав. */
export function buildDocument(content: BookContent): string {
  const body = content.chapters
    .map(
      (chapter, index) =>
        `<section class="${CHAPTER_CLASS}" data-chapter="${index}">${chapter.html}</section>`,
    )
    .join('\n');
  return (
    '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    `<style>${BASE_STYLE}</style></head><body>${body}</body></html>`
  );
}

/** Токены темы области чтения, присланные приложением. */
export interface ReaderThemeTokens {
  /** Фон области чтения. */
  background?: string;
  /** Цвет текста книги. */
  text?: string;
  /** Вторичный цвет текста. */
  muted?: string;
  /** Цвет ссылок. */
  link?: string;
  /** Цвет заливки выделения. */
  selection?: string;
  /** Цвет вертикальных меток выделения. */
  selectionEdge?: string;
  /** Толщина меток выделения в пикселях. */
  selectionEdgeWidth?: number;
  /** Тон подсветки найденного поиском. */
  search?: string;
  /** Тон подсветки текущего вхождения поиска. */
  searchActive?: string;
}

/** Сообщение темы области чтения от приложения. */
export interface ReaderThemeMessage {
  /** Сторона темы. */
  id?: string;
  /** Токены области. */
  tokens?: ReaderThemeTokens;
  /** Мягкие тона заметок по идентификаторам цвета. */
  notes?: Record<string, string>;
  /** Плоские непрозрачные тона подсветки цитат (`--note-solid-*`). */
  solid?: Record<string, string>;
  /** Гарнитура книги (CSS `font-family`). */
  font?: string;
  /** Идентификатор гарнитуры: `serif` или `sans`. */
  fontId?: string;
}

/** Идентификаторы цветов заметок в том же порядке, что у приложения. */
const NOTE_COLORS = ['yellow', 'green', 'blue', 'red', 'purple'] as const;

/** Применение темы: CSS-переменные на корне документа книги. */
export function applyReaderTheme(root: HTMLElement, message: ReaderThemeMessage): void {
  const tokens = message.tokens ?? {};
  const set = (name: string, value: string | number | undefined) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    root.style.setProperty(name, String(value));
  };
  set('--rt-background', tokens.background);
  set('--rt-foreground', tokens.text);
  set('--rt-muted', tokens.muted);
  set('--rt-link', tokens.link);
  set('--rt-selection', tokens.selection);
  set('--rt-selection-edge', tokens.selectionEdge);
  // Толщина меток приходит числом пикселей: в CSS ей нужна единица.
  if (tokens.selectionEdgeWidth !== undefined && tokens.selectionEdgeWidth !== null) {
    set('--rt-selection-edge-width', `${tokens.selectionEdgeWidth}px`);
  }
  set('--rt-search', tokens.search);
  set('--rt-search-active', tokens.searchActive);
  set('--rt-font', message.font);
  if (message.fontId === 'serif' || message.fontId === 'sans') {
    root.dataset.readerFont = message.fontId;
  }
  const notes = message.notes ?? {};
  const solid = message.solid ?? {};
  for (const color of NOTE_COLORS) {
    set(`--note-${color}`, notes[color]);
    set(`--note-solid-${color}`, solid[color] ?? notes[color]);
  }
  if (message.id === 'dark' || message.id === 'light') {
    root.dataset.readerTheme = message.id;
  }
}
