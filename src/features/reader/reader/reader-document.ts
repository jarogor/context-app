/** Документ книги для встроенного чтения: сборка HTML/CSS и имена классов.
 *
 * Модуль чист от Svelte: собирает автономный `srcdoc`-документ для iframe и
 * экспортирует классы, по которым компонент чтения находит подсветки и
 * наложения заметок. Разметка и оформление собраны здесь, чтобы компонент
 * занимался поведением, а не вёрсткой документа.
 *
 * Оформление области чтения задаётся **темой области чтения**: единый
 * набор значений дизайн-системы (`@context/ui`), общий для встроенного чтения и
 * плагина рабочего места. Документ изолирован и не наследует CSS оболочки,
 * поэтому значения встраиваются сюда, а их сторона выбирается атрибутом
 * `data-reader-theme` на корне документа (переключается без пересборки).
 */

import {
  DEFAULT_PALETTE,
  DEFAULT_READER_FONT,
  DEFAULT_READER_THEME,
  normalizePaletteId,
  normalizeReaderFontId,
  normalizeReaderThemeId,
  PALETTES,
  READER_FONT_FAMILIES,
  READER_FONTS,
  READER_NOTE_COLOR_IDS,
  READER_THEMES,
  readerThemeNoteTones,
  readerThemeTokens,
  solidNoteTones,
  type PaletteId,
  type ReaderFontId,
  type ReaderThemeId,
} from '@context/ui';

import type { BookContent } from './types';

/** Класс подсветки заметки-цитаты. */
export const NOTE_CLASS = 'context-note';
/** Класс временной вспышки подсветки при переходе к заметке. */
export const FLASH_CLASS = 'context-note-flash';
/** Класс превью подсветки при правке границ цитаты. */
export const NOTE_PREVIEW_CLASS = 'context-resize-preview';
/** Класс слоя активного выделения текста. */
export const SELECTION_LAYER_CLASS = 'context-selection-layer';
/** Класс полосы активного выделения. */
export const SELECTION_BAND_CLASS = 'context-selection-band';
/** Класс раздела главы книги. */
export const CHAPTER_CLASS = 'context-chapter';
/** Отступ сверху до опорной строки при масштабировании, в пикселях. */
export const ZOOM_ANCHOR_MARGIN = 18;

/** Настройки оформления документа книги. */
export interface ReaderDocumentOptions {
  /** Палитра оформления: общий реестр дизайн-системы. */
  palette?: PaletteId;
  /** Сторона темы области чтения. */
  readerTheme?: ReaderThemeId;
  /** Гарнитура книги: с засечками или без. */
  readerFont?: ReaderFontId;
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

/** Стиль документа книги: общая вёрстка и оформление по палитре и стороне темы.
 *
 * Переменные каждой палитры и стороны встроены в документ сразу и выбираются
 * атрибутами на его корне: `data-reader-palette` — палитра, `data-reader-theme` —
 * сторона. Так смена палитры или темы не пересобирает содержимое книги: позиция
 * чтения и разметка заметок сохраняются.
 */
function buildStyle(): string {
  const rules: string[] = [];
  for (const palette of PALETTES) {
    for (const theme of READER_THEMES) {
      rules.push(
        `html[data-reader-palette='${palette.id}'][data-reader-theme='${theme}']{${themeVariables(palette.id, theme)}}`,
      );
    }
  }
  return [
    'html{font-size:100%;position:relative;}',
    // База — палитра по умолчанию, светлая сторона: правило действует, пока
    // атрибуты не выставлены (первый кадр документа).
    `html{${themeVariables(DEFAULT_PALETTE, DEFAULT_READER_THEME)}}`,
    ...rules,
    // Поля и ширина колонки документа принадлежат читалке, а не книге: при
    // переносе текста из EPUB в несжатом виде издательский CSS снимал их, и
    // текст прижимался к левому краю области. `!important` защищает каркас от
    // правил книги, которые всё же доходят до `body`.
    //
    // Ширина колонки задана в `rem`, а не в пикселях: кегль задаётся на корне
    // документа, поэтому `rem` растёт вместе с масштабом чтения. Пиксельная
    // ширина оставляла крупный текст на узкой полоске посреди окна.
    'body{margin:0 auto !important;width:100% !important;',
    'max-width:48rem !important;padding:1.5rem 2rem !important;box-sizing:border-box;}',
    'body{background:var(--rt-background);color:var(--rt-foreground);line-height:1.6;}',
    // Гарнитура книги выбирается атрибутом на корне документа: смена шрифта не
    // пересобирает содержимое, позиция чтения и заметки сохраняются. Семейства
    // заданы для обеих гарнитур сразу — так же, как палитры и стороны темы.
    ...READER_FONTS.map(
      (font) => `html[data-reader-font='${font}'] body{font-family:${READER_FONT_FAMILIES[font]};}`,
    ),
    // База — гарнитура по умолчанию: правило действует, пока атрибут не выставлен.
    `html body{font-family:${READER_FONT_FAMILIES[DEFAULT_READER_FONT]};}`,
    // Типографика книги: без неё книга с оформлением в классах (или вовсе без
    // CSS) выглядела ровным текстом — заголовки того же кегля, что и абзацы.
    // Правила намеренно слабые (`ем` и `rem`, а не пиксели): они следуют за
    // масштабом чтения и не спорят с более точными правилами книги.
    'img{max-width:100%;height:auto;}',
    'h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.4em 0 0.6em;font-weight:600;}',
    'h1{font-size:1.8em;}',
    'h2{font-size:1.5em;}',
    'h3{font-size:1.3em;}',
    'h4{font-size:1.15em;}',
    'h5,h6{font-size:1em;}',
    'p{margin:0.7em 0;text-align:justify;hyphens:auto;}',
    // Первый абзац после заголовка не получает отступа первой строки: так
    // набирают книги, и иначе абзац «проваливается» от заголовка.
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
    // Инструменты текста и фигуры не работают с выделением текста: курсор
    // меняется на прицел, а протяжка не выделяет текст под собой.
    'body[data-tool="text"],body[data-tool="shape"]{cursor:crosshair;user-select:none;}',
    'body[data-tool="text"] *,body[data-tool="shape"] *{cursor:crosshair;}',
    // Под инструментами «текст» и «фигура» поверх существующей заметки новую не
    // поставить: клик открывает меню уже имеющейся заметки. Заметка при этом
    // кликабельна, и курсор это показывает — указатель вместо прицела (как в
    // плагине PDF); правило сильнее общего `crosshair`.
    'body[data-tool="text"] .context-note-card,body[data-tool="shape"] .context-note-card,',
    'body[data-tool="text"] mark.context-note,body[data-tool="shape"] mark.context-note,',
    'body[data-tool="text"] .context-note-shape path,body[data-tool="shape"] .context-note-shape path',
    '{cursor:pointer !important;}',
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
    // Метка чуть выходит за строку сверху и снизу (по полпикселя), но не «торчит».
    `top:-0.5px;bottom:-0.5px;width:var(--rt-selection-edge-width,1px);`,
    `background:var(--rt-selection-edge);border-radius:calc(0.5 * var(--rt-selection-edge-width,1px));}`,
    // Метки стоят у краёв всего выделения: левая — в начале, правая — в конце.
    // У промежуточных строк меток нет, иначе они читаются как отдельные выделения
    // (особенно при строках разной длины). Метка центрируется на самой границе
    // полосы (на полширины внутрь и наружу), чтобы её середина совпадала с краем
    // выделения, а полоса не казалась шире на толщину метки — как в плагине PDF.
    `.${SELECTION_BAND_CLASS}[data-edge="start"]::before,.${SELECTION_BAND_CLASS}[data-edge="both"]::before{content:"";left:calc(-0.5 * var(--rt-selection-edge-width,1px));}`,
    `.${SELECTION_BAND_CLASS}[data-edge="end"]::after,.${SELECTION_BAND_CLASS}[data-edge="both"]::after{content:"";right:calc(-0.5 * var(--rt-selection-edge-width,1px));}`,
    // Цвет текста подсветки не меняется: браузерный стиль `<mark>` иначе
    // закрашивает выделенный текст чёрным (`MarkText`) и на тёмной стороне он
    // выпадает из темы. В PDF текст — часть растра и остаётся цветом темы, так
    // что наследование делает обе области одинаковыми. `box-decoration-break`
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
    // одинаков на всех областях, без тени и тёмной полосы.
    '.context-note-card{position:absolute;max-width:220px;padding:6px 8px;border-radius:6px;',
    'font-size:13px;line-height:1.4;white-space:pre-wrap;cursor:pointer;z-index:2;}',
    '.context-note-card[data-color="yellow"]{background:var(--note-yellow);}',
    '.context-note-card[data-color="green"]{background:var(--note-green);}',
    '.context-note-card[data-color="blue"]{background:var(--note-blue);}',
    '.context-note-card[data-color="red"]{background:var(--note-red);}',
    '.context-note-card[data-color="purple"]{background:var(--note-purple);}',
    // Слой фигуры позиционируется по рамке самой фигуры (инлайн-стили из
    // `renderShape`), а не растягивается на всю главу: у высоких глав WebKit
    // не рисует слишком большой композитный слой. Умножение задано здесь:
    // на дочерних SVG-элементах оно в WebKit не применяется.
    '.context-note-shape{position:absolute;pointer-events:none;overflow:visible;',
    'mix-blend-mode:multiply;}',
    // Фигура — полупрозрачная заливка цветом заметки, как подсветка цитаты,
    // без обводки: прямоугольник и эллипс залиты, линия — толстый штрих. Цвет
    // мягкий, чтобы заметка была видна, но не затмевала текст.
    '.context-note-shape rect,.context-note-shape ellipse{stroke:none;fill-opacity:0.5;',
    'vector-effect:non-scaling-stroke;pointer-events:none;}',
    '.context-note-shape line{fill:none;stroke-width:4;stroke-opacity:0.6;',
    'vector-effect:non-scaling-stroke;pointer-events:none;}',
    '.context-note-shape path{fill:transparent;stroke:transparent;stroke-width:16;',
    'vector-effect:non-scaling-stroke;pointer-events:all;cursor:pointer;}',
    // Рамка будущей фигуры во время протяжки: без неё рисование было «слепым»
    // (в PDF такая рамка есть). Пунктир и осевые линии показывают, где встанет
    // фигура ещё до отпускания кнопки.
    '.context-note-preview{position:absolute;z-index:3;pointer-events:none;',
    'border:1px dashed #2563eb;box-sizing:border-box;}',
    '.context-note-preview::before{content:"";position:absolute;left:0;right:0;top:50%;',
    'height:1px;background:#2563eb;opacity:0.6;}',
    '.context-note-preview::after{content:"";position:absolute;top:0;bottom:0;left:50%;',
    'width:1px;background:#2563eb;opacity:0.6;}',
    '.context-note-shape[data-color="yellow"] rect,.context-note-shape[data-color="yellow"] ellipse{fill:var(--note-yellow);}',
    '.context-note-shape[data-color="yellow"] line{stroke:var(--note-yellow);}',
    '.context-note-shape[data-color="green"] rect,.context-note-shape[data-color="green"] ellipse{fill:var(--note-green);}',
    '.context-note-shape[data-color="green"] line{stroke:var(--note-green);}',
    '.context-note-shape[data-color="blue"] rect,.context-note-shape[data-color="blue"] ellipse{fill:var(--note-blue);}',
    '.context-note-shape[data-color="blue"] line{stroke:var(--note-blue);}',
    '.context-note-shape[data-color="red"] rect,.context-note-shape[data-color="red"] ellipse{fill:var(--note-red);}',
    '.context-note-shape[data-color="red"] line{stroke:var(--note-red);}',
    '.context-note-shape[data-color="purple"] rect,.context-note-shape[data-color="purple"] ellipse{fill:var(--note-purple);}',
    '.context-note-shape[data-color="purple"] line{stroke:var(--note-purple);}',
    // Вспышка при переходе к заметке: оранжевая, различима на обеих сторонах.
    `.${NOTE_CLASS}.${FLASH_CLASS}{background:#f59e0b;}`,
    `.context-overlay.${FLASH_CLASS}{opacity:0.4;}`,
    // Правка заметки: перемещение показывается хваткой, границы цитаты — маркерами.
    'body[data-editing="move"]{cursor:move;}',
    'body[data-editing="move"] .context-overlay{cursor:move;}',
    'body[data-editing="resize"],body[data-editing="resize"] *{cursor:ew-resize;}',
    '.context-note-handle{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;',
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
  const readerFont = normalizeReaderFontId(options.readerFont);
  const style = buildStyle();
  const body = value.chapters
    .map(
      (chapter, index) =>
        `<section class="${CHAPTER_CLASS}" data-chapter="${index}">${chapter.html}</section>`,
    )
    .join('\n');
  return `<!doctype html><html lang="ru" data-reader-palette="${palette}" data-reader-theme="${readerTheme}" data-reader-font="${readerFont}"><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`;
}
