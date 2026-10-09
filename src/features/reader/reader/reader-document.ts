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
  solidNoteTones,
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
/** Класс слоя активного выделения текста. */
export const SELECTION_LAYER_CLASS = 'texture-selection-layer';
/** Класс полосы активного выделения. */
export const SELECTION_BAND_CLASS = 'texture-selection-band';
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
  const solid = solidNoteTones(tones, tokens.background);
  return [
    `--rt-background:${tokens.background};`,
    `--rt-foreground:${tokens.text};`,
    `--rt-muted:${tokens.muted};`,
    `--rt-link:${tokens.link};`,
    `--rt-selection:${tokens.selection};`,
    `--rt-selection-edge:${tokens.selectionEdge};`,
    `--rt-selection-edge-width:${tokens.selectionEdgeWidth}px;`,
    ...READER_NOTE_COLOR_IDS.map((color) => `--note-${color}:${tones[color]};`),
    // Непрозрачный эквивалент тона для подсветки цитаты: её фон рисуется
    // перенесёнными кусками, которые при дробном масштабе перекрываются, и
    // полупрозрачный тон давал бы тёмную полосу на стыке (см. highlight.ts).
    ...READER_NOTE_COLOR_IDS.map((color) => `--note-solid-${color}:${solid[color]};`),
  ].join('');
}

/** Стиль документа книги: общая вёрстка и оформление по стороне темы. */
function buildStyle(palette: PaletteId): string {
  const light = themeVariables(palette, 'light');
  const dark = themeVariables(palette, 'dark');
  return [
    'html{font-size:100%;position:relative;}',
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
    // Заливку выделения рисует собственный слой (как в PDF), а не браузер:
    // разные движки красят `::selection` по-разному (по высоте строки или по
    // рамке глифов), поэтому своя полоса не совпала бы с нативной. Нативное
    // выделение делается прозрачным и остаётся средством копирования.
    '::selection{background:transparent;}',
    // Признак активного выделения: собственный слой поверх глав с полосами по
    // строкам диапазона и вертикальными метками по их краям. Заливка и метки —
    // один элемент, поэтому совпадают на любом движке. Слой показывает, что это
    // живое выделение, а не подсветка заметки (у подсветки меток нет).
    `.${SELECTION_LAYER_CLASS}{position:absolute;left:0;top:0;pointer-events:none;z-index:1;`,
    `mix-blend-mode:multiply;}`,
    `html[data-reader-theme='dark'] .${SELECTION_LAYER_CLASS}{mix-blend-mode:screen;}`,
    `.${SELECTION_BAND_CLASS}{position:absolute;border-radius:2px;background:var(--rt-selection);}`,
    `.${SELECTION_BAND_CLASS}::before,.${SELECTION_BAND_CLASS}::after{content:none;position:absolute;`,
    `top:-1px;bottom:-1px;width:var(--rt-selection-edge-width,2px);`,
    `background:var(--rt-selection-edge);border-radius:1px;}`,
    // Метки стоят у краёв всего выделения: левая — в начале, правая — в конце.
    // У промежуточных строк меток нет, иначе они читаются как отдельные выделения
    // (особенно при строках разной длины).
    `.${SELECTION_BAND_CLASS}[data-edge="start"]::before,.${SELECTION_BAND_CLASS}[data-edge="both"]::before{content:"";left:0;}`,
    `.${SELECTION_BAND_CLASS}[data-edge="end"]::after,.${SELECTION_BAND_CLASS}[data-edge="both"]::after{content:"";right:0;}`,
    // Цвет текста подсветки не меняется: браузерный стиль `<mark>` иначе
    // закрашивает выделенный текст чёрным (`MarkText`) и на тёмной стороне он
    // выпадает из темы. В PDF текст — часть растра и остаётся цветом темы, так
    // что наследование делает обе поверхности одинаковыми. `box-decoration-break`
    // в `clone` даёт каждому перенесённому куску подсветки свои вертикальные
    // отступы (см. `fitMarkToLineHeight`): фон расширяется до высоты строки и
    // полосы стыкуются встык, как в PDF.
    `.${NOTE_CLASS}{border-radius:2px;cursor:pointer;color:inherit;`,
    `box-decoration-break:clone;-webkit-box-decoration-break:clone;}`,
    // Подсветка берёт непрозрачный эквивалент тона (`--note-solid-*`): куски
    // подсветки перекрываются на доли пикселя (см. `fitMarkToLineHeight`), а
    // полупрозрачные слои на стыке складывали бы альфу и давали тёмную полосу.
    `.${NOTE_CLASS}[data-color="yellow"]{background:var(--note-solid-yellow);}`,
    `.${NOTE_CLASS}[data-color="green"]{background:var(--note-solid-green);}`,
    `.${NOTE_CLASS}[data-color="blue"]{background:var(--note-solid-blue);}`,
    `.${NOTE_CLASS}[data-color="red"]{background:var(--note-solid-red);}`,
    `.${NOTE_CLASS}[data-color="purple"]{background:var(--note-solid-purple);}`,
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
