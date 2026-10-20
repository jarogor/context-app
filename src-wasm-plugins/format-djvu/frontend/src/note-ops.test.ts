import { describe, expect, it } from 'vitest';

import { redrawAllNotes } from './note-ops';
import { pagesEl } from './dom';
import type { ViewerNote } from './types';

/** Страница книги с наложением заметок. */
function page(number: number): HTMLElement {
  const pageEl = document.createElement('div');
  pageEl.className = 'page';
  pageEl.dataset.page = String(number);
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  pageEl.append(overlay);
  pagesEl.append(pageEl);
  return pageEl;
}

/** Заметка-цитата на странице. */
function quoteNote(id: string, pageNumber: number): ViewerNote {
  return {
    id,
    type: 'quote',
    color: 'yellow',
    text: '',
    anchor: JSON.stringify({
      v: 1,
      kind: 'page',
      chapter: 0,
      start: 0,
      end: 0,
      quote: 'строка',
      percent: 0,
      page: pageNumber,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
    }),
  };
}

describe('redrawAllNotes', () => {
  it('рисует заметку только на её странице', () => {
    pagesEl.replaceChildren();
    page(1);
    page(2);
    redrawAllNotes([quoteNote('q1', 2)]);
    const first = pagesEl.children[0].querySelectorAll('.note');
    const second = pagesEl.children[1].querySelectorAll('.note');
    expect(first.length).toBe(0);
    expect(second.length).toBe(1);
    expect((second[0] as HTMLElement).dataset.noteId).toBe('q1');
  });

  it('повторная перерисовка не дублирует подсветки', () => {
    pagesEl.replaceChildren();
    page(1);
    const notes = [quoteNote('q1', 1)];
    redrawAllNotes(notes);
    redrawAllNotes(notes);
    expect(pagesEl.children[0].querySelectorAll('.note').length).toBe(1);
  });

  it('заметка с повреждённым якорем пропускается', () => {
    pagesEl.replaceChildren();
    page(1);
    const broken: ViewerNote = { id: 'bad', type: 'quote', color: 'yellow', text: '', anchor: '{' };
    redrawAllNotes([broken]);
    expect(pagesEl.children[0].querySelectorAll('.note').length).toBe(0);
  });
});
