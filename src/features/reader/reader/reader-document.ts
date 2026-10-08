/** Документ книги для встроенного чтения: сборка HTML/CSS и имена классов.
 *
 * Модуль чист от Svelte: собирает автономный `srcdoc`-документ для iframe и
 * экспортирует классы, по которым компонент чтения находит подсветки и
 * наложения заметок. Разметка и оформление собраны здесь, чтобы компонент
 * занимался поведением, а не вёрсткой документа.
 *
 * Оформление поверхности чтения задаётся **темой области чтения**: единый
 * набор значений дизайн-системы (`@texture/ui`), общий для встроенного чтения и
 * плагина рабочего места. Документ изолирован и не наследует CSS оболочки,
 * поэтому значения встраиваются сюда, а их сторона выбирается атрибутом
 * `data-reader-theme` на корне документа (переключается без пересборки).
 */

import {
  normalizePaletteId,
  normalizeReaderThemeId,
  READER_NOTE_COLOR_IDS,
  readerThemeNoteTones,
  readerThemeTokens,
  type PaletteId,
  type ReaderThemeId,
} from '@texture/ui';

import type { BookContent } from './types';

/** Класс подсветки заметки-цитаты. */
export const NOTE_CLASS = 'texture-note';
/** Класс временной вспышки подсветки при переходе к заметке. */
export const FLASH_CLASS = 'texture-note-flash';
/** Класс превью подсветки при правке границ цитаты. */
export const NOTE_PREVIEW_CLASS = 'texture-resize-preview';
/** Класс раздела главы книги. */
export const CHAPTER_CLASS = 'texture-chapter';
/** Отступ сверху до опорной строки при масштабировании, в пикселях. */
export const ZOOM_ANCHOR_MARGIN = 18;

/** Настройки оформления документа книги. */
export interface ReaderDocumentOptions {
  /** Палитра оформления: общий реестр дизайн-системы. */
  palette?: PaletteId;
  /** Сторона темы области чтения. */
  readerTheme?: ReaderThemeId;
}

/** CSS-переменные темы области чтения для палитры и стороны. */
function themeVariables(palette: PaletteId, id: ReaderThemeId): string {
  const tokens = readerThemeTokens(palette, id);
  const tones = readerThemeNoteTones(palette, id);
  return [
    `--rt-background:${tokens.background};`,
    `--rt-foreground:${tokens.text};`,
    `--rt-muted:${tokens.muted};`,
    `--rt-link:${tokens.link};`,
    `--rt-selection:${tokens.selection};`,
    ...READER_NOTE_COLOR_IDS.map((color) => `--note-${color}:${tones[color]};`),
  ].join('');
}

/** Стиль документа книги: общая вёрстка и оформление по стороне темы. */
function buildStyle(palette: PaletteId): string {
  const light = themeVariables(palette, 'light');
  const dark = themeVariables(palette, 'dark');
  return [
    'html{font-size:100%;}',
    // Светлая сторона — база; сторона выбирается атрибутом на корне и меняется
    // без пересборки документа.
    `html{${light}}`,
    `html[data-reader-theme='light']{${light}}`,
    `html[data-reader-theme='dark']{${dark}}`,
    'body{margin:0 auto;max-width:760px;padding:24px 32px;background:var(--rt-background);',
    "color:var(--rt-foreground);font-family:Georgia,'Times New Roman',serif;line-height:1.6;}",
    'img{max-width:100%;height:auto;}',
    'h1,h2,h3{line-height:1.25;}',
    'a{color:var(--rt-link);}',
    'small,figcaption{color:var(--rt-muted);}',
    // Инструменты текста и фигуры не работают с выделением текста: курсор
    // меняется на прицел, а протяжка не выделяет текст под собой.
    'body[data-tool="text"],body[data-tool="shape"]{cursor:crosshair;user-select:none;}',
    'body[data-tool="text"] *,body[data-tool="shape"] *{cursor:crosshair;}',
    // Выделение текста — синеватое, из темы области чтения: на тёмной стороне
    // оно светлее и плотнее, чтобы читаться так же ясно, как на светлой.
    '::selection{background:var(--rt-selection);}',
    `.${NOTE_CLASS}{border-radius:2px;cursor:pointer;}`,
    `.${NOTE_CLASS}[data-color="yellow"]{background:var(--note-yellow);}`,
    `.${NOTE_CLASS}[data-color="green"]{background:var(--note-green);}`,
    `.${NOTE_CLASS}[data-color="blue"]{background:var(--note-blue);}`,
    `.${NOTE_CLASS}[data-color="red"]{background:var(--note-red);}`,
    `.${NOTE_CLASS}[data-color="purple"]{background:var(--note-purple);}`,
    `.${NOTE_CLASS}[data-color="black"]{background:var(--note-black);}`,
    `.${CHAPTER_CLASS}{position:relative;}`,
    // Карточка окрашена тем же мягким тоном, что цитата и фигура: цвет заметки
    // одинаков на всех поверхностях, без тени и тёмной полосы.
    '.texture-note-card{position:absolute;max-width:220px;padding:6px 8px;border-radius:6px;',
    'font-size:13px;line-height:1.4;white-space:pre-wrap;cursor:pointer;z-index:2;}',
    '.texture-note-card[data-color="yellow"]{background:var(--note-yellow);}',
    '.texture-note-card[data-color="green"]{background:var(--note-green);}',
    '.texture-note-card[data-color="blue"]{background:var(--note-blue);}',
    '.texture-note-card[data-color="red"]{background:var(--note-red);}',
    '.texture-note-card[data-color="purple"]{background:var(--note-purple);}',
    '.texture-note-card[data-color="black"]{background:var(--note-black);}',
    // Слой фигуры позиционируется по рамке самой фигуры (инлайн-стили из
    // `renderShape`), а не растягивается на всю главу: у высоких глав WebKit
    // не рисует слишком большой композитный слой. Умножение задано здесь:
    // на дочерних SVG-элементах оно в WebKit не применяется.
    '.texture-note-shape{position:absolute;pointer-events:none;overflow:visible;',
    'mix-blend-mode:multiply;}',
    // Фигура — полупрозрачная заливка цветом заметки, как подсветка цитаты,
    // без обводки: прямоугольник и эллипс залиты, линия — толстый штрих. Цвет
    // мягкий, чтобы заметка была видна, но не затмевала текст.
    '.texture-note-shape rect,.texture-note-shape ellipse{stroke:none;fill-opacity:0.5;',
    'vector-effect:non-scaling-stroke;pointer-events:none;}',
    '.texture-note-shape line{fill:none;stroke-width:4;stroke-opacity:0.6;',
    'vector-effect:non-scaling-stroke;pointer-events:none;}',
    '.texture-note-shape path{fill:transparent;stroke:transparent;stroke-width:16;',
    'vector-effect:non-scaling-stroke;pointer-events:all;cursor:pointer;}',
    // Рамка будущей фигуры во время протяжки: без неё рисование было «слепым»
    // (в PDF такая рамка есть). Пунктир и осевые линии показывают, где встанет
    // фигура ещё до отпускания кнопки.
    '.texture-note-preview{position:absolute;z-index:3;pointer-events:none;',
    'border:1px dashed #2563eb;box-sizing:border-box;}',
    '.texture-note-preview::before{content:"";position:absolute;left:0;right:0;top:50%;',
    'height:1px;background:#2563eb;opacity:0.6;}',
    '.texture-note-preview::after{content:"";position:absolute;top:0;bottom:0;left:50%;',
    'width:1px;background:#2563eb;opacity:0.6;}',
    '.texture-note-shape[data-color="yellow"] rect,.texture-note-shape[data-color="yellow"] ellipse{fill:var(--note-yellow);}',
    '.texture-note-shape[data-color="yellow"] line{stroke:var(--note-yellow);}',
    '.texture-note-shape[data-color="green"] rect,.texture-note-shape[data-color="green"] ellipse{fill:var(--note-green);}',
    '.texture-note-shape[data-color="green"] line{stroke:var(--note-green);}',
    '.texture-note-shape[data-color="blue"] rect,.texture-note-shape[data-color="blue"] ellipse{fill:var(--note-blue);}',
    '.texture-note-shape[data-color="blue"] line{stroke:var(--note-blue);}',
    '.texture-note-shape[data-color="red"] rect,.texture-note-shape[data-color="red"] ellipse{fill:var(--note-red);}',
    '.texture-note-shape[data-color="red"] line{stroke:var(--note-red);}',
    '.texture-note-shape[data-color="purple"] rect,.texture-note-shape[data-color="purple"] ellipse{fill:var(--note-purple);}',
    '.texture-note-shape[data-color="purple"] line{stroke:var(--note-purple);}',
    '.texture-note-shape[data-color="black"] rect,.texture-note-shape[data-color="black"] ellipse{fill:var(--note-black);}',
    '.texture-note-shape[data-color="black"] line{stroke:var(--note-black);}',
    // Вспышка при переходе к заметке: оранжевая, различима на обеих сторонах.
    `.${NOTE_CLASS}.${FLASH_CLASS}{background:#f59e0b;}`,
    `.texture-overlay.${FLASH_CLASS}{opacity:0.4;}`,
    // Правка заметки: перемещение показывается хваткой, границы цитаты — маркерами.
    'body[data-editing="move"]{cursor:move;}',
    'body[data-editing="move"] .texture-overlay{cursor:move;}',
    'body[data-editing="resize"],body[data-editing="resize"] *{cursor:ew-resize;}',
    '.texture-note-handle{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;',
    'border-radius:50%;background:#1d4ed8;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);',
    'cursor:ew-resize;z-index:5;}',
    // Превью подсветки при правке границ цитаты: прямоугольники поверх текста,
    // чтобы не перестраивать сам текст и не сбрасывать выделение.
    `.${NOTE_PREVIEW_CLASS}{position:absolute;pointer-events:none;opacity:0.45;z-index:1;}`,
  ].join('');
}

/** Сборка документа книги из глав: оформление и разметка глав. */
export function buildDocument(value: BookContent, options: ReaderDocumentOptions = {}): string {
  const palette = normalizePaletteId(options.palette);
  const readerTheme = normalizeReaderThemeId(options.readerTheme);
  const style = buildStyle(palette);
  const body = value.chapters
    .map(
      (chapter, index) =>
        `<section class="${CHAPTER_CLASS}" data-chapter="${index}">${chapter.html}</section>`,
    )
    .join('\n');
  return `<!doctype html><html lang="ru" data-reader-theme="${readerTheme}"><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`;
}
