import { describe, expect, it } from 'vitest';
import { normalizeSet } from '../notes/notes';
import { setLocale } from '@context/i18n';
import { bookTitleOf, fallbackBookTitle, librarySets, noteCountLabel } from './notes-library';

/** Набор реестра из сырого ответа плагина. */
function set(raw: Record<string, unknown>) {
  return normalizeSet(raw);
}

describe('резервное имя книги', () => {
  it('берёт имя файла без расширения', () => {
    expect(fallbackBookTitle('/home/user/Downloads/book.pdf')).toBe('book');
    expect(fallbackBookTitle('/lib/a.epub')).toBe('a');
  });

  it('терпит путь без расширения и пустой ключ', () => {
    expect(fallbackBookTitle('/lib/folder')).toBe('folder');
    expect(fallbackBookTitle('')).toBe('');
  });

  it('предпочитает сохранённое имя книги резервному', () => {
    expect(bookTitleOf(set({ id: 'ns', book_key: '/a/b.pdf', book_title: 'Война и мир' }))).toBe(
      'Война и мир',
    );
    expect(bookTitleOf(set({ id: 'ns', book_key: '/a/b.pdf' }))).toBe('b');
  });
});

describe('склонение числа заметок', () => {
  it('склоняет запись по-русски', () => {
    setLocale('ru');
    expect(noteCountLabel(0)).toBe('0 заметок');
    expect(noteCountLabel(1)).toBe('1 заметка');
    expect(noteCountLabel(2)).toBe('2 заметки');
    expect(noteCountLabel(5)).toBe('5 заметок');
    expect(noteCountLabel(11)).toBe('11 заметок');
    expect(noteCountLabel(21)).toBe('21 заметка');
  });

  it('склоняет запись по-английски', () => {
    // Язык интерфейса меняет не только словарь, но и правила склонения:
    // английский различает только единственное и множественное число.
    setLocale('en');
    expect(noteCountLabel(1)).toBe('1 note');
    expect(noteCountLabel(2)).toBe('2 notes');
    setLocale('ru');
  });
});

describe('наборы реестра', () => {
  it('показывает каждый набор с книгой-подписью и заметками', () => {
    const rows = librarySets(
      [
        set({
          id: 'ns-1',
          book_key: '/a.pdf',
          book_title: 'Книга A',
          name: 'Основные',
          notes: [{ id: 'n1', quote: 'первая', page: 3, created_at_millis: 10 }],
        }),
        set({
          id: 'ns-2',
          book_key: '/a.pdf',
          book_title: 'Книга A',
          name: 'Черновики',
          notes: [],
        }),
        set({ id: 'ns-3', book_key: '/a/b.pdf', name: 'Основные' }),
      ],
      '',
    );

    expect(rows).toHaveLength(3);
    expect(rows[0].name).toBe('Основные');
    expect(rows[0].bookName).toBe('a.pdf');
    expect(rows[0].noteItems).toHaveLength(1);
    expect(rows[0].updatedAtMillis).toBeGreaterThan(0);
    expect(rows[1].noteItems).toHaveLength(0);
    expect(rows[2].bookName).toBe('b.pdf');
  });

  it('книга — подпись: группировка не выделяет её отдельным блоком', () => {
    const rows = librarySets(
      [
        set({ id: 'ns-1', book_key: 'opaque-key', name: 'A' }),
        set({ id: 'ns-2', book_key: 'opaque-key', name: 'B' }),
      ],
      '',
    );
    // Два набора одной книги — две записи, у каждой своя книга-подпись.
    expect(rows).toHaveLength(2);
    expect(rows[0].bookKey).toBe('opaque-key');
    expect(rows[1].bookKey).toBe('opaque-key');
  });
});

describe('глобальный поиск', () => {
  const sets = [
    set({
      id: 'ns-1',
      book_key: '/a.pdf',
      book_title: 'Мысль и язык',
      name: 'Основные',
      notes: [
        { id: 'n1', quote: 'язык определяет мышление', page: 12 },
        { id: 'n2', quote: 'другая мысль', page: 4 },
      ],
    }),
    set({
      id: 'ns-2',
      book_key: '/b.pdf',
      book_title: 'Другая книга',
      name: 'Черновики',
      notes: [{ id: 'n3', title: 'Вопрос', comment: 'уточнить термин', text: '' }],
    }),
  ];

  it('пустой запрос возвращает весь реестр', () => {
    expect(librarySets(sets, '   ')).toHaveLength(2);
  });

  it('находит по имени набора и книги целиком', () => {
    expect(librarySets(sets, 'черновик').map((row) => row.id)).toEqual(['ns-2']);
    expect(librarySets(sets, 'мысль и язык').map((row) => row.id)).toEqual(['ns-1']);
  });

  it('находит по содержимому заметок', () => {
    expect(librarySets(sets, 'мышление').map((row) => row.id)).toEqual(['ns-1']);
    expect(librarySets(sets, 'уточнить').map((row) => row.id)).toEqual(['ns-2']);
  });

  it('находит по месту заметки', () => {
    expect(librarySets(sets, 'стр. 12').map((row) => row.id)).toEqual(['ns-1']);
  });

  it('по содержимому оставляет только подходящие заметки набора', () => {
    const rows = librarySets(sets, 'мышление');
    expect(rows[0].noteItems.map((item) => item.note.id)).toEqual(['n1']);
  });

  it('без совпадений даёт пустой результат', () => {
    expect(librarySets(sets, 'нет такого')).toHaveLength(0);
  });
});

describe('пустой реестр', () => {
  it('опознаётся', () => {
    expect(librarySets([], '')).toHaveLength(0);
    expect(librarySets([set({ id: 'ns', book_key: '/a' })], '')).toHaveLength(1);
  });
});
