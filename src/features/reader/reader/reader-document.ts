/** Документ книги для встроенного чтения: сборка HTML/CSS и имена классов.
 *
 * Модуль чист от Svelte: собирает автономный `srcdoc`-документ для iframe и
 * экспортирует классы, по которым компонент чтения находит подсветки и
 * наложения заметок. Разметка и оформление собраны здесь, чтобы компонент
 * занимался поведением, а не вёрсткой документа.
 */

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

/** Сборка документа книги из глав: оформление и разметка глав. */
export function buildDocument(value: BookContent): string {
  const style = [
    'html{font-size:100%;}',
    'body{margin:0 auto;max-width:760px;padding:24px 32px;background:#fff;',
    "color:#1f2937;font-family:Georgia,'Times New Roman',serif;line-height:1.6;}",
    'img{max-width:100%;height:auto;}',
    'h1,h2,h3{line-height:1.25;}',
    'a{color:#4338ca;}',
    // Инструменты текста и фигуры не работают с выделением текста: курсор
    // меняется на прицел, а протяжка не выделяет текст под собой.
    'body[data-tool="text"],body[data-tool="shape"]{cursor:crosshair;user-select:none;}',
    'body[data-tool="text"] *,body[data-tool="shape"] *{cursor:crosshair;}',
    `.${NOTE_CLASS}{border-radius:2px;cursor:pointer;}`,
    `.${NOTE_CLASS}[data-color="yellow"]{background:#fde68a;}`,
    `.${NOTE_CLASS}[data-color="green"]{background:#bbf7d0;}`,
    `.${NOTE_CLASS}[data-color="blue"]{background:#bfdbfe;}`,
    `.${NOTE_CLASS}[data-color="red"]{background:#fecaca;}`,
    `.${NOTE_CLASS}[data-color="purple"]{background:#ddd6fe;}`,
    `.${NOTE_CLASS}[data-color="black"]{background:#d1d5db;}`,
    `.${CHAPTER_CLASS}{position:relative;}`,
    // Карточка окрашена тем же мягким тоном, что цитата и фигура: цвет заметки
    // одинаков на всех поверхностях, без тени и тёмной полосы.
    '.texture-note-card{position:absolute;max-width:220px;padding:6px 8px;border-radius:6px;',
    'font-size:13px;line-height:1.4;white-space:pre-wrap;cursor:pointer;z-index:2;}',
    '.texture-note-card[data-color="yellow"]{background:#fde68a;}',
    '.texture-note-card[data-color="green"]{background:#bbf7d0;}',
    '.texture-note-card[data-color="blue"]{background:#bfdbfe;}',
    '.texture-note-card[data-color="red"]{background:#fecaca;}',
    '.texture-note-card[data-color="purple"]{background:#ddd6fe;}',
    '.texture-note-card[data-color="black"]{background:#d1d5db;}',
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
    '.texture-note-shape[data-color="yellow"] rect,.texture-note-shape[data-color="yellow"] ellipse{fill:#fde68a;}',
    '.texture-note-shape[data-color="yellow"] line{stroke:#fde68a;}',
    '.texture-note-shape[data-color="green"] rect,.texture-note-shape[data-color="green"] ellipse{fill:#bbf7d0;}',
    '.texture-note-shape[data-color="green"] line{stroke:#bbf7d0;}',
    '.texture-note-shape[data-color="blue"] rect,.texture-note-shape[data-color="blue"] ellipse{fill:#bfdbfe;}',
    '.texture-note-shape[data-color="blue"] line{stroke:#bfdbfe;}',
    '.texture-note-shape[data-color="red"] rect,.texture-note-shape[data-color="red"] ellipse{fill:#fecaca;}',
    '.texture-note-shape[data-color="red"] line{stroke:#fecaca;}',
    '.texture-note-shape[data-color="purple"] rect,.texture-note-shape[data-color="purple"] ellipse{fill:#ddd6fe;}',
    '.texture-note-shape[data-color="purple"] line{stroke:#ddd6fe;}',
    '.texture-note-shape[data-color="black"] rect,.texture-note-shape[data-color="black"] ellipse{fill:#d1d5db;}',
    '.texture-note-shape[data-color="black"] line{stroke:#d1d5db;}',
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
  const body = value.chapters
    .map(
      (chapter, index) =>
        `<section class="${CHAPTER_CLASS}" data-chapter="${index}">${chapter.html}</section>`,
    )
    .join('\n');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`;
}
