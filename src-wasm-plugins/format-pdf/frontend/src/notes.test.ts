import { describe, expect, it } from 'vitest';

import { anchorOf, drawNotes, noteById } from './notes';
import { editor } from './editing-state';
import type { NoteAnchor, ViewerNote } from './types';

/** Страница с наложением для отрисовки заметок. */
function page(number: number): HTMLElement {
  const el = document.createElement('div');
  el.dataset.page = String(number);
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  el.append(overlay);
  return el;
}

/** Якорь-цитата на странице. */
function quoteAnchor(pageNumber: number): NoteAnchor {
  return {
    v: 1,
    kind: 'page',
    chapter: 0,
    start: 0,
    end: 0,
    quote: 'цитата',
    percent: 0,
    page: pageNumber,
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
  };
}

/** Якорь-точка на странице. */
function pointAnchor(pageNumber: number, x: number, y: number): NoteAnchor {
  return {
    v: 1,
    kind: 'point',
    chapter: 0,
    start: 0,
    end: 0,
    quote: '',
    percent: 0,
    page: pageNumber,
    x,
    y,
  };
}

describe('anchorOf', () => {
  it('разбирает якорь и отбрасывает повреждённый', () => {
    expect(anchorOf({ id: 'n', anchor: JSON.stringify(quoteAnchor(1)) })?.page).toBe(1);
    expect(anchorOf({ id: 'n', anchor: '{' })).toBeNull();
    expect(anchorOf(null)).toBeNull();
  });
});

describe('noteById', () => {
  it('находит заметку по идентификатору', () => {
    const notes: ViewerNote[] = [{ id: 'a' }, { id: 'b' }];
    expect(noteById(notes, 'b')?.id).toBe('b');
    expect(noteById(notes, 'нет')).toBeNull();
  });
});

describe('drawNotes', () => {
  it('рисует цитату подсветкой по полосам строк', () => {
    const el = page(1);
    const note: ViewerNote = {
      id: 'q1',
      type: 'quote',
      color: 'green',
      anchor: JSON.stringify(quoteAnchor(1)),
    };
    drawNotes(el, [note]);
    const highlights = el.querySelectorAll('.note');
    expect(highlights).toHaveLength(1);
    expect((highlights[0] as HTMLElement).dataset.noteId).toBe('q1');
    expect((highlights[0] as HTMLElement).style.left).toBe('10%');
  });

  it('рисует текстовую карточку по точке', () => {
    const el = page(1);
    const note: ViewerNote = {
      id: 't1',
      type: 'text',
      text: 'заметка',
      anchor: JSON.stringify(pointAnchor(1, 0.25, 0.5)),
    };
    drawNotes(el, [note]);
    const card = el.querySelector('.note-card') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toBe('заметка');
    expect(card.style.top).toBe('50%');
  });

  it('рисует фигуру с мишенью клика', () => {
    const el = page(1);
    const note: ViewerNote = {
      id: 's1',
      type: 'shape',
      shape: 'rectangle',
      geometry: JSON.stringify({ x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3 }),
      anchor: JSON.stringify(pointAnchor(1, 0.1, 0.1)),
    };
    drawNotes(el, [note]);
    const svg = el.querySelector('.note-shape') as SVGSVGElement;
    expect(svg).not.toBeNull();
    expect(svg.querySelector('rect')).not.toBeNull();
    expect(svg.querySelector('.note-shape-hit')).not.toBeNull();
  });

  it('пропускает заметки других страниц и без якоря', () => {
    const el = page(2);
    drawNotes(el, [
      { id: 'other', type: 'quote', anchor: JSON.stringify(quoteAnchor(1)) },
      { id: 'none', type: 'quote' },
    ]);
    expect(el.querySelectorAll('.note').length).toBe(0);
  });

  it('повторная отрисовка заменяет прежние наложения', () => {
    const el = page(1);
    const note: ViewerNote = {
      id: 'q1',
      type: 'quote',
      color: 'green',
      anchor: JSON.stringify(quoteAnchor(1)),
    };
    drawNotes(el, [note]);
    drawNotes(el, [note]);
    expect(el.querySelectorAll('.note').length).toBe(1);
  });

  it('черновик перемещения подменяет место карточки', () => {
    const el = page(1);
    const note: ViewerNote = {
      id: 't1',
      type: 'text',
      text: 'заметка',
      anchor: JSON.stringify(pointAnchor(1, 0.25, 0.5)),
    };
    editor.moveDrag = {
      note,
      anchor: pointAnchor(1, 0.25, 0.5),
      geometry: null,
      draftAnchor: pointAnchor(1, 0.75, 0.5),
    };
    try {
      drawNotes(el, [note]);
      const card = el.querySelector('.note-card') as HTMLElement;
      expect(card.style.left).toBe('75%');
    } finally {
      editor.moveDrag = null;
    }
  });
});
