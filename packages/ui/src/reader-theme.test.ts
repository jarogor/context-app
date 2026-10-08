import { describe, expect, it } from 'vitest';

import { DEFAULT_PALETTE, PALETTES } from './palettes';
import {
  applyReaderTheme,
  DEFAULT_READER_THEME,
  isReaderThemeId,
  normalizeReaderThemeId,
  READER_NOTE_COLOR_IDS,
  readerPageColors,
  readerThemeNoteTones,
  readerThemeTokens,
} from './reader-theme';

describe('нормализация темы области чтения', () => {
  it('сохраняет допустимые значения', () => {
    expect(isReaderThemeId('light')).toBe(true);
    expect(isReaderThemeId('dark')).toBe(true);
    expect(normalizeReaderThemeId('light')).toBe('light');
    expect(normalizeReaderThemeId('dark')).toBe('dark');
  });

  it('неизвестное значение приводит к светлой теме', () => {
    expect(DEFAULT_READER_THEME).toBe('light');
    expect(isReaderThemeId('sepia')).toBe(false);
    expect(normalizeReaderThemeId('sepia')).toBe('light');
    expect(normalizeReaderThemeId(undefined)).toBe('light');
  });
});

describe('applyReaderTheme', () => {
  it('выставляет атрибут data-reader-theme', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyReaderTheme('dark', root);

    expect(root.dataset.readerTheme).toBe('dark');
  });

  it('неизвестную тему заменяет светлой', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyReaderTheme('неизвестная', root);

    expect(root.dataset.readerTheme).toBe('light');
  });
});

describe('readerThemeTokens', () => {
  it('для каждой палитры и стороны различает фон и текст', () => {
    for (const palette of PALETTES) {
      const light = readerThemeTokens(palette.id, 'light');
      const dark = readerThemeTokens(palette.id, 'dark');
      expect(light.background).not.toBe(dark.background);
      expect(light.text).not.toBe(dark.text);
      for (const tokens of [light, dark]) {
        expect(tokens.background).toBeTruthy();
        expect(tokens.text).toBeTruthy();
        expect(tokens.muted).toBeTruthy();
        expect(tokens.link).toBeTruthy();
        expect(tokens.selection).toBeTruthy();
      }
    }
  });

  it('работает для палитры по умолчанию', () => {
    expect(readerThemeTokens(DEFAULT_PALETTE, 'light').text).toBeTruthy();
  });

  it('выделение различимо на обеих сторонах и различается между ними', () => {
    for (const palette of PALETTES) {
      const light = readerThemeTokens(palette.id, 'light').selection;
      const dark = readerThemeTokens(palette.id, 'dark').selection;
      // Синеватый оттенок: канал синего заметно выше красного.
      for (const value of [light, dark]) {
        const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
        expect(channels[2]).toBeGreaterThan(channels[0]);
      }
      // Тёмная сторона задана отдельно: на тёмной бумаге нужен иной оттенок.
      expect(dark).not.toBe(light);
    }
  });
});

describe('readerPageColors', () => {
  it('задаёт бумагу и текст для каждой палитры', () => {
    for (const palette of PALETTES) {
      const colors = readerPageColors(palette.id);
      expect(colors.paper).toMatch(/^#[0-9a-f]{6}$/i);
      expect(colors.ink).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('бумага темнее текста и палитры различаются', () => {
    const gruvbox = readerPageColors('gruvbox');
    const mist = readerPageColors('mist');
    expect(gruvbox.paper).not.toBe(mist.paper);
    // Бумага темнее текста, теплее/холоднее нейтрального и не «почти чёрная».
    for (const colors of [gruvbox, mist]) {
      const paper = Number.parseInt(colors.paper.slice(1), 16);
      const ink = Number.parseInt(colors.ink.slice(1), 16);
      const paperLum = ((paper >> 16) & 255) * 0.299 + ((paper >> 8) & 255) * 0.587 + (paper & 255) * 0.114;
      const inkLum = ((ink >> 16) & 255) * 0.299 + ((ink >> 8) & 255) * 0.587 + (ink & 255) * 0.114;
      // Темнее прежней светлой бумаги, но заметно светлее нейтрального чёрного.
      expect(paperLum).toBeGreaterThan(35);
      expect(paperLum).toBeLessThan(58);
      expect(inkLum).toBeGreaterThan(paperLum);
    }
  });
});

describe('readerThemeNoteTones', () => {
  it('светлая сторона совпадает с прежним набором', () => {
    const tones = readerThemeNoteTones('gruvbox', 'light');
    expect(tones.yellow).toBe('#fde68a');
    expect(tones.black).toBe('#d1d5db');
    expect(readerThemeNoteTones('mist', 'light')).toEqual(tones);
  });

  it('тёмная сторона отличается и задана для всех цветов', () => {
    for (const palette of PALETTES) {
      const light = readerThemeNoteTones(palette.id, 'light');
      const dark = readerThemeNoteTones(palette.id, 'dark');
      for (const color of READER_NOTE_COLOR_IDS) {
        expect(dark[color]).toBeTruthy();
        expect(dark[color]).not.toBe(light[color]);
      }
    }
  });

  it('тёмные тона заметок различимы между собой', () => {
    const dark = readerThemeNoteTones('gruvbox', 'dark');
    const values = READER_NOTE_COLOR_IDS.map((color) => dark[color]);
    expect(new Set(values).size).toBe(values.length);
  });
});
