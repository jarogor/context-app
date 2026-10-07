import { describe, expect, it } from 'vitest';
import { NOTE_COLORS } from '../../notes/notes';
import { buildDocument, CHAPTER_CLASS, FLASH_CLASS, NOTE_CLASS } from './reader-document';

/** Документ с одной главой для проверки оформления. */
function documentFor(html = '<p>Текст</p>'): string {
  return buildDocument({
    title: 'Книга',
    authors: [],
    chapters: [{ title: null, html }],
  });
}

describe('документ книги', () => {
  it('содержит правило цвета для всех цветов палитры, включая чёрный', () => {
    const html = documentFor();
    for (const color of NOTE_COLORS) {
      expect(html).toContain(`data-color="${color}"`);
    }
    expect(NOTE_COLORS).toContain('black');
  });

  it('содержит стили карточек, фигур и подсветки', () => {
    const html = documentFor();
    expect(html).toContain('.texture-note-card');
    expect(html).toContain('.texture-note-shape');
    expect(html).toContain(`.${CHAPTER_CLASS}{position:relative;}`);
    expect(html).toContain(`.${NOTE_CLASS}.${FLASH_CLASS}`);
  });

  it('размечает каждую главу разделом с индексом', () => {
    const html = buildDocument({
      title: 'Книга',
      authors: [],
      chapters: [
        { title: null, html: '<p>Первая</p>' },
        { title: null, html: '<p>Вторая</p>' },
      ],
    });
    expect(html).toContain(`<section class="${CHAPTER_CLASS}" data-chapter="0"><p>Первая</p></section>`);
    expect(html).toContain(`<section class="${CHAPTER_CLASS}" data-chapter="1"><p>Вторая</p></section>`);
  });
});
