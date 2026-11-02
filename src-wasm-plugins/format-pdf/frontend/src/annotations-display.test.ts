import { describe, expect, it } from 'vitest';

import {
  drawAnnotations,
  resetAnnotations,
  setAnnotationsForPage,
  showAnnotations,
  type ViewerAnnotation,
} from './annotations';

/** Страница книги с наложением заметок. */
function page(number: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'page';
  el.dataset.page = String(number);
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  el.append(overlay);
  document.body.append(el);
  return el;
}

/** Встроенная пометка страницы. */
function annotation(overrides: Partial<ViewerAnnotation> = {}): ViewerAnnotation {
  return {
    id: 'a1',
    kind: 'highlight',
    page: 1,
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    quote: 'текст',
    comment: '',
    author: '',
    color: '#ffff00',
    modified: '',
    ...overrides,
  };
}

describe('показ встроенных пометок на странице', () => {
  it('по умолчанию ничего не рисует', () => {
    resetAnnotations();
    const el = page(1);
    drawAnnotations(el);
    expect(el.querySelectorAll('[data-file-annotation="true"]')).toHaveLength(0);
    el.remove();
  });

  it('рисует только показанную пометку и ставит её цвет', () => {
    resetAnnotations();
    setAnnotationsForPage(1, [
      annotation({ id: 'a1' }),
      annotation({ id: 'a2', color: '#00ff00' }),
    ]);
    const el = page(1);
    showAnnotations(['a2']);
    drawAnnotations(el);

    const bands = el.querySelectorAll('[data-file-annotation="true"]');
    expect(bands).toHaveLength(1);
    expect((bands[0] as HTMLElement).dataset.annotationId).toBe('a2');
    expect((bands[0] as HTMLElement).style.getPropertyValue('--file-annotation-color')).toBe(
      '#00ff00',
    );
    expect((bands[0] as HTMLElement).style.left).toBe('10%');
    el.remove();
  });

  it('снимает показ по пустому списку идентификаторов', () => {
    resetAnnotations();
    setAnnotationsForPage(1, [annotation()]);
    const el = page(1);
    showAnnotations(['a1']);
    drawAnnotations(el);
    expect(el.querySelectorAll('[data-file-annotation="true"]')).toHaveLength(1);

    showAnnotations([]);
    drawAnnotations(el);
    expect(el.querySelectorAll('[data-file-annotation="true"]')).toHaveLength(0);
    el.remove();
  });

  it('рисует вид пометки на полосе: подчёркивание, зачёркивание, стикер', () => {
    resetAnnotations();
    setAnnotationsForPage(1, [
      annotation({ id: 'u', kind: 'underline' }),
      annotation({ id: 's', kind: 'strikeout' }),
      annotation({ id: 'n', kind: 'note', rects: [{ x: 0, y: 0, width: 0.1, height: 0.1 }] }),
    ]);
    const el = page(1);
    showAnnotations(['u', 's', 'n']);
    drawAnnotations(el);

    const kinds = Array.from(el.querySelectorAll('[data-file-annotation="true"]')).map(
      (band) => (band as HTMLElement).dataset.kind,
    );
    expect(kinds).toEqual(['underline', 'strikeout', 'note']);
    el.remove();
  });

  it('не рисует пометки другой страницы', () => {
    resetAnnotations();
    setAnnotationsForPage(2, [annotation({ id: 'a1', page: 2 })]);
    const el = page(1);
    showAnnotations(['a1']);
    drawAnnotations(el);
    expect(el.querySelectorAll('[data-file-annotation="true"]')).toHaveLength(0);
    el.remove();
  });
});
