import { describe, expect, it } from 'vitest';

import { redrawAllNotes, stopEditing } from './note-ops';
import { editor } from './editing-state';
import { state } from './state';
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

  it('выход из правки границ возвращает мишени цитаты', () => {
    /* Правимая цитата заменяется черновиком на всю страницу, а настоящие
       мишени `.note` из наложения убираются. `stopEditing` снимал состояние, но
       не перерисовывал заметки: черновик оставался, мишень не возвращалась, и
       цитата после Escape не открывала меню и не правилась. */
    pagesEl.replaceChildren();
    const pageEl = page(1);
    const notes = [quoteNote('q1', 1)];
    // Заметки книги живут в общем состоянии: по нему идёт перерисовка.
    state.notes = notes;
    redrawAllNotes(notes);
    expect(pageEl.querySelectorAll('.note').length).toBe(1);

    editor.editing = { noteId: 'q1', mode: 'resize' };
    editor.resizeDrag = {
      note: notes[0],
      anchor: JSON.parse(notes[0].anchor ?? '{}'),
      edge: 'start',
      draft: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
    };
    redrawAllNotes(notes);
    expect(pageEl.querySelectorAll('.note-resize-draft').length).toBe(1);
    expect(pageEl.querySelectorAll('.note').length).toBe(0);

    stopEditing();

    expect(editor.editing).toBeNull();
    expect(pageEl.querySelectorAll('.note-resize-draft').length).toBe(0);
    expect(pageEl.querySelectorAll('.note').length).toBe(1);
  });
