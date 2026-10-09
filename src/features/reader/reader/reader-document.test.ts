import { describe, expect, it } from 'vitest';
import { NOTE_COLORS } from '../../notes/notes';
import { buildDocument, CHAPTER_CLASS, FLASH_CLASS, NOTE_CLASS, SELECTION_BAND_CLASS, SELECTION_LAYER_CLASS } from './reader-document';

/** Документ с одной главой для проверки оформления. */
function documentFor(html = '<p>Текст</p>'): string {
  return buildDocument({
    title: 'Книга',
    authors: [],
    chapters: [{ title: null, html }],
  });
}

describe('документ книги', () => {
  it('содержит правило цвета для всех цветов палитры', () => {
    const html = documentFor();
    for (const color of NOTE_COLORS) {
      expect(html).toContain(`data-color="${color}"`);
      expect(html).toContain(`--note-${color}:`);
    }
    expect(NOTE_COLORS).not.toContain('black');
  });

  it('подсветка заметки берёт непрозрачный эквивалент тона', () => {
    const html = documentFor();
    // Полупрозрачные тона на перекрытии кусков давали бы тёмную полосу на стыке,
    // поэтому фон подсветки задаётся отдельной непрозрачной переменной.
    expect(html).toContain('--note-solid-yellow:');
    expect(html).toContain('background:var(--note-solid-yellow)');
  });

  it('содержит стили карточек, фигур и подсветки', () => {
    const html = documentFor();
    expect(html).toContain('.texture-note-card');
    expect(html).toContain('.texture-note-shape');
    expect(html).toContain(`.${CHAPTER_CLASS}{position:relative;}`);
    expect(html).toContain(`.${NOTE_CLASS}.${FLASH_CLASS}`);
  });

  it('задаёт оформление для обеих сторон темы области чтения', () => {
    const html = documentFor();
    expect(html).toContain("html[data-reader-theme='light']");
    expect(html).toContain("html[data-reader-theme='dark']");
    // Базовая вёрстка берёт фон и текст из переменных темы области чтения.
    expect(html).toContain('background:var(--rt-background)');
    expect(html).toContain('color:var(--rt-foreground)');
    // Заливку рисует собственный слой (как в PDF), а нативное выделение
    // прозрачно: движки красят `::selection` по-разному.
    expect(html).toContain('::selection{background:transparent;}');
    expect(html).toContain('.texture-selection-band{position:absolute;border-radius:2px;background:var(--rt-selection);}');
    expect(html).toContain('--rt-selection:');
  });

  it('содержит слой активного выделения и токены его меток', () => {
    const html = documentFor();
    expect(html).toContain(`.${SELECTION_LAYER_CLASS}`);
    expect(html).toContain(`.${SELECTION_BAND_CLASS}`);
    // Вертикальные метки — только у краёв всего выделения: левая в начале,
    // правая в конце; у промежуточных строк меток нет.
    expect(html).toContain(`[data-edge="start"]::before`);
    expect(html).toContain(`[data-edge="end"]::after`);
    expect(html).toContain(`[data-edge="both"]::before`);
    expect(html).toContain(`[data-edge="both"]::after`);
    expect(html).toContain('--rt-selection-edge');
    expect(html).toContain('--rt-selection-edge-width');
  });

  it('проставляет стартовую тему области чтения на корень', () => {
    const light = documentFor();
    expect(light).toContain('data-reader-theme="light"');
    const dark = buildDocument(
      { title: 'Книга', authors: [], chapters: [{ title: null, html: '<p>Текст</p>' }] },
      { readerTheme: 'dark' },
    );
    expect(dark).toContain('data-reader-theme="dark"');
  });

  it('стороны темы различают фон и мягкие тона заметок', () => {
    const html = documentFor();
    const light = html.match(/html\[data-reader-theme='light'\]\{([^}]*)\}/)?.[1] ?? '';
    const dark = html.match(/html\[data-reader-theme='dark'\]\{([^}]*)\}/)?.[1] ?? '';
    expect(light).toContain('--rt-background');
    expect(dark).toContain('--rt-background');
    expect(light).not.toBe(dark);
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
