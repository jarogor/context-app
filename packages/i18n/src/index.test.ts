import { describe, expect, it } from 'vitest';

import { en } from './dict/en';
import { ru } from './dict/ru';
import { formatDateTimeFor, formatTimeFor } from './format';
import { isLocale, LOCALES, normalizeLocale, applyLocale } from './locale';
import { interpolate, pluralForm, translate } from './translate';

describe('языки интерфейса', () => {
  it('поддерживает русский и английский', () => {
    expect(LOCALES).toEqual(['ru', 'en']);
  });

  it('приводит неизвестный язык к русскому', () => {
    expect(isLocale('de')).toBe(false);
    expect(normalizeLocale('de')).toBe('ru');
    expect(normalizeLocale(undefined)).toBe('ru');
    expect(normalizeLocale('en')).toBe('en');
  });

  it('применяет язык к документу', () => {
    const root = document.createElement('div');
    applyLocale('en', root);
    expect(root.lang).toBe('en');
    expect(root.dataset.locale).toBe('en');
  });
});

describe('словари', () => {
  it('английский содержит все ключи русского', () => {
    // Ключи задаёт русский словарь: пропущенный перевод — ошибка сборки,
    // поэтому здесь проверяется фактическое совпадение наборов.
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  it('формы множественного числа совпадают по составу в русском', () => {
    for (const value of Object.values(ru)) {
      if (typeof value === 'object') {
        expect(value.one).toBeTruthy();
        expect(value.many).toBeTruthy();
        expect(value.other).toBeTruthy();
      }
    }
  });
});

describe('перевод', () => {
  it('находит текст по ключу для выбранного языка', () => {
    expect(translate('app.action.save', {}, 'ru')).toBe('Сохранить');
    expect(translate('app.action.save', {}, 'en')).toBe('Save');
  });

  it('подставляет параметры', () => {
    expect(translate('app.notes.library.changed', { date: '01.02.2024' }, 'ru')).toBe(
      'Изменён 01.02.2024',
    );
    expect(interpolate('a {b} c', { b: 1 })).toBe('a 1 c');
    // Отсутствующий параметр остаётся в тексте, а не теряется.
    expect(interpolate('a {missing} c')).toBe('a {missing} c');
  });

  it('склоняет число заметок по-русски', () => {
    expect(translate('app.note.count', { count: 1 }, 'ru')).toBe('1 заметка');
    expect(translate('app.note.count', { count: 3 }, 'ru')).toBe('3 заметки');
    expect(translate('app.note.count', { count: 5 }, 'ru')).toBe('5 заметок');
    expect(translate('app.note.count', { count: 21 }, 'ru')).toBe('21 заметка');
    expect(translate('app.note.count', { count: 22 }, 'ru')).toBe('22 заметки');
    expect(translate('app.note.count', { count: 11 }, 'ru')).toBe('11 заметок');
  });

  it('склоняет число заметок по-английски', () => {
    expect(translate('app.note.count', { count: 1 }, 'en')).toBe('1 note');
    expect(translate('app.note.count', { count: 2 }, 'en')).toBe('2 notes');
    expect(translate('app.note.count', { count: 0 }, 'en')).toBe('0 notes');
  });

  it('выбирает форму по правилам языка', () => {
    expect(pluralForm('ru', 1)).toBe('one');
    expect(pluralForm('ru', 3)).toBe('few');
    expect(pluralForm('ru', 5)).toBe('many');
    expect(pluralForm('en', 1)).toBe('one');
    expect(pluralForm('en', 2)).toBe('other');
  });
});

describe('форматирование по языку', () => {
  it('даёт русскую дату с днём впереди', () => {
    const millis = new Date(2023, 10, 15, 1, 13).getTime();
    expect(formatDateTimeFor('ru', millis)).toBe('15.11.2023 01:13');
  });

  it('даёт английскую дату с месяцем впереди и 12-часовым форматом', () => {
    const millis = new Date(2023, 10, 15, 13, 5).getTime();
    expect(formatDateTimeFor('en', millis)).toBe('11/15/2023 01:05 PM');
    const midnight = new Date(2023, 10, 15, 0, 5).getTime();
    expect(formatDateTimeFor('en', midnight)).toBe('11/15/2023 12:05 AM');
  });

  it('пустой миллисекундный ноль даёт пустую строку', () => {
    expect(formatDateTimeFor('ru', 0)).toBe('');
    expect(formatDateTimeFor('en', 0)).toBe('');
    expect(formatTimeFor('ru', 0)).toBe('');
    expect(formatTimeFor('en', 0)).toBe('');
  });

  it('форматирует время по языку', () => {
    const millis = new Date(2023, 10, 15, 15, 4, 9).getTime();
    expect(formatTimeFor('ru', millis)).toBe('15:04:09');
    expect(formatTimeFor('en', millis)).toBe('03:04:09 PM');
  });
});
