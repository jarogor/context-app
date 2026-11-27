import { describe, expect, it } from 'vitest';

import {
  anchorOf,
  clearSelectionBands,
  drawNotes,
  noteById,
  selectionBandsOf,
  setSelectionBands,
} from './notes';
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

describe('полосы живого выделения', () => {
  it('изменение полос сообщается один раз', () => {
    // Растр перерисовывается только по изменению: на каждом движении указателя
    // это была бы лишняя работа, а на неизменных полосах — перерисовка впустую.
    const el = document.createElement('div');
    const bands = [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }];
    const first = setSelectionBands(el, bands);
    expect(first.map((change) => change.pageEl)).toEqual([el]);
    expect(first[0].region?.x).toBeCloseTo(0.1);
    expect(first[0].region?.y).toBeCloseTo(0.2);
    expect(first[0].region?.width).toBeCloseTo(0.3);
    expect(first[0].region?.height).toBeCloseTo(0.05);
    expect(
      setSelectionBands(
        el,
        bands.map((rect) => ({ ...rect })),
      ),
    ).toEqual([]);
    // Перерисовывается только место, где полосы были и где стали: вся страница
    // в WebKit стоит около десяти миллисекунд на каждое движение указателя.
    const moved = setSelectionBands(el, [{ x: 0.1, y: 0.3, width: 0.3, height: 0.05 }]);
    expect(moved.map((change) => change.pageEl)).toEqual([el]);
    expect(moved[0].region?.y).toBeCloseTo(0.2);
    expect(moved[0].region?.height).toBeCloseTo(0.15);
  });

  it('снятие полос убирает их со всех страниц', () => {
    const el = document.createElement('div');
    setSelectionBands(el, [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }]);
    const cleared = clearSelectionBands();
    expect(cleared.map((change) => change.pageEl)).toEqual([el]);
    expect(cleared[0].region?.y).toBeCloseTo(0.2);
    expect(selectionBandsOf(el)).toEqual([]);
    expect(clearSelectionBands()).toEqual([]);
  });

  it('уход выделения на другую страницу снимает прежние полосы', () => {
    // Иначе полосы остались бы на странице, где выделение было раньше.
    const first = document.createElement('div');
    const second = document.createElement('div');
    const bands = [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }];
    setSelectionBands(first, bands);
    const changes = setSelectionBands(second, bands);
    expect(changes.map((change) => change.pageEl)).toEqual([second, first]);
    expect(selectionBandsOf(first)).toEqual([]);
  });
});
