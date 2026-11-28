import { describe, expect, it } from 'vitest';

import { handlePagesClick, pointFraction } from './gestures';
import { editor } from './editing-state';
import { pagesEl } from './dom';
import { stopEditing } from './note-ops';
import type { ViewerNote } from './types';

/** Страница с подменённой геометрией (jsdom не считает раскладку). */
function pageWithRect(left: number, top: number, width: number, height: number): HTMLElement {
  const pageEl = document.createElement('div');
  pageEl.className = 'page';
  pageEl.getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
  return pageEl;
}

describe('pointFraction', () => {
  it('переводит координаты указателя в доли страницы', () => {
    const pageEl = pageWithRect(100, 50, 400, 200);
    expect(pointFraction(pageEl, 300, 150)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('зажимает точку краями страницы', () => {
    const pageEl = pageWithRect(0, 0, 100, 100);
    expect(pointFraction(pageEl, -20, 200)).toEqual({ x: 0, y: 1 });
  });

  it('страница без размера даёт левый верхний угол', () => {
    expect(pointFraction(pageWithRect(0, 0, 0, 0), 10, 10)).toEqual({ x: 0, y: 0 });
  });
});

describe('handlePagesClick', () => {
  /** Страница известного размера: jsdom не считает раскладку. */
  function sizedPage(): HTMLElement {
    // Страница входит в контейнер книги: по нему ищется страница правки.
    pagesEl.replaceChildren();
    const pageEl = pageWithRect(0, 0, 400, 600);
    pageEl.dataset.page = '1';
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    pageEl.append(overlay);
    pagesEl.append(pageEl);
    return pageEl;
  }

  /** Клик с указанной точкой по узлу. */
  function click(target: Element, clientX: number, clientY: number): MouseEvent {
    return { target, clientX, clientY } as unknown as MouseEvent;
  }

  it('выходит из правки по клику мимо цитаты', () => {
    /* Во время правки цитата заменена черновиком на всю страницу. Попадание
       считалось по элементу с `data-note-id`, то есть по черновику, и любая
       точка страницы оказывалась «внутри» цитаты — клик мимо не выходил из
       правки. */
    const pageEl = sizedPage();
    const note: ViewerNote = { id: 'q1', type: 'quote', color: 'yellow', text: '', anchor: '{}' };
    editor.editing = { noteId: 'q1', mode: 'resize' };
    editor.resizeDrag = {
      note,
      anchor: {
        v: 1,
        kind: 'page',
        chapter: 0,
        start: 0,
        end: 0,
        quote: 'строка',
        percent: 0,
        page: 1,
        rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }],
      },
      edge: 'start',
    };
    // Как в наложении во время правки: черновик лежит на всю страницу и несёт
    // тот же `data-note-id`. Именно по нему раньше считалось попадание.
    const draft = document.createElement('div');
    draft.className = 'note-resize-draft';
    draft.dataset.noteId = 'q1';
    draft.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600 }) as DOMRect;
    pageEl.append(draft);
    // Точка в нижней части страницы: далеко от цитаты в её верхней части.
    handlePagesClick(click(draft, 200, 500));
    expect(editor.editing).toBeNull();
    pageEl.remove();
  });

  it('не выходит из правки по клику внутри цитаты', () => {
    const pageEl = sizedPage();
    const note: ViewerNote = { id: 'q1', type: 'quote', color: 'yellow', text: '', anchor: '{}' };
    editor.editing = { noteId: 'q1', mode: 'resize' };
    editor.resizeDrag = {
      note,
      anchor: {
        v: 1,
        kind: 'page',
        chapter: 0,
        start: 0,
        end: 0,
        quote: 'строка',
        percent: 0,
        page: 1,
        rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.05 }],
      },
      edge: 'start',
    };
    // Точка внутри прямоугольника цитаты (84…204 по X, 60…90 по Y).
    handlePagesClick(click(pageEl, 140, 75));
    expect(editor.editing).not.toBeNull();
    stopEditing();
    pageEl.remove();
  });
});
