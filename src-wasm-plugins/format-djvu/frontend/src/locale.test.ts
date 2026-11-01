import { describe, expect, it } from 'vitest';

import { normalizeViewerLocale, setViewerLocale, viewerLocale, viewerText } from './locale';

describe('язык модуля рисования DjVu', () => {
  it('по умолчанию русский', () => {
    setViewerLocale(undefined);
    expect(viewerLocale()).toBe('ru');
    expect(viewerText('opening')).toBe('Открытие книги…');
  });

  it('принимает код языка приложения', () => {
    setViewerLocale('en');
    expect(viewerLocale()).toBe('en');
    expect(viewerText('opening')).toBe('Opening the book…');
    expect(viewerText('openFailed')).toBe('Could not display the book: ');
  });

  it('неизвестный код даёт русский', () => {
    setViewerLocale('de');
    expect(viewerLocale()).toBe('ru');
    expect(normalizeViewerLocale(undefined)).toBe('ru');
  });
});
