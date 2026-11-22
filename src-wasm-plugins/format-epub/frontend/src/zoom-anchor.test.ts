import { describe, expect, it } from 'vitest';

import { applyWithAnchor } from './zoom-anchor';

/** Документ с опорной строкой внутри `body`. */
function bookDocument(top: number): {
  doc: Document;
  range: Range;
  setTop: (value: number) => void;
} {
  const doc = document;
  doc.body.innerHTML = '<p>Строка книги</p>';
  const paragraph = doc.querySelector('p') as HTMLParagraphElement;
  const range = doc.createRange();
  range.setStart(paragraph.firstChild as Text, 0);
  range.setEnd(paragraph.firstChild as Text, 0);
  let lineTop = top;
  range.getBoundingClientRect = () => new DOMRect(0, lineTop, 100, 20);
  // Верхнюю строку области документ отдаёт этой же кареткой.
  (doc as Document & { caretRangeFromPoint?: () => Range }).caretRangeFromPoint = () => range;
  return { doc, range, setTop: (value) => (lineTop = value) };
}

describe('удержание места чтения при перестройке текста', () => {
  it('возвращает опорную строку на прежнее экранное место', () => {
    const { doc, setTop } = bookDocument(100);
    const root = doc.scrollingElement ?? doc.documentElement;
    root.scrollTop = 500;

    // Перестройка текста сдвигает строку на 260 px вниз: без компенсации
    // пользователь оказывался бы на другом месте книги.
    applyWithAnchor(doc, () => setTop(360));

    expect(root.scrollTop).toBe(760);
  });

  it('не трогает прокрутку, когда строка осталась на месте', () => {
    const { doc } = bookDocument(100);
    const root = doc.scrollingElement ?? doc.documentElement;
    root.scrollTop = 500;

    applyWithAnchor(doc, () => {});

    expect(root.scrollTop).toBe(500);
  });
});
