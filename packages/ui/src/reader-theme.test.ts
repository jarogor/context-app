import { describe, expect, it } from 'vitest';

import { DEFAULT_PALETTE, PALETTES } from './palettes';
import {
  applyReaderFont,
  applyReaderTheme,
  blendNoteToneOverBackground,
  DEFAULT_READER_FONT,
  DEFAULT_READER_THEME,
  isReaderFontId,
  isReaderThemeId,
  normalizeReaderFontId,
  normalizeReaderThemeId,
  READER_FONTS,
  readerFontFamily,
  READER_NOTE_COLOR_IDS,
  readerPageColors,
  readerThemeNoteTones,
  readerThemeTokens,
  solidNoteTones,
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

  it('метки выделения заданы на обеих сторонах и плотнее заливки', () => {
    for (const palette of PALETTES) {
      const light = readerThemeTokens(palette.id, 'light');
      const dark = readerThemeTokens(palette.id, 'dark');
      for (const tokens of [light, dark]) {
        expect(tokens.selectionEdge).toBeTruthy();
        expect(tokens.selectionEdgeWidth).toBeGreaterThan(0);
      }
      // Тёмная сторона задана отдельным цветом для читаемости.
      expect(dark.selectionEdge).not.toBe(light.selectionEdge);
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
    const linen = readerPageColors('linen');
    const cobalt = readerPageColors('cobalt');
    expect(linen.paper).not.toBe(cobalt.paper);
    // Бумага темнее текста, теплее/холоднее нейтрального и не «почти чёрная».
    for (const colors of [linen, cobalt]) {
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
  it('светлая сторона общая для палитр и задана для всех цветов', () => {
    const tones = readerThemeNoteTones('linen', 'light');
    expect(tones.yellow).toBe('#f2cd52');
    expect(tones.green).toBe('#82d991');
    expect(tones.blue).toBe('#84adf0');
    expect(tones.red).toBe('#ef817b');
    expect(tones.purple).toBe('#bba0e8');
    expect(readerThemeNoteTones('cobalt', 'light')).toEqual(tones);
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
    const dark = readerThemeNoteTones('linen', 'dark');
    const values = READER_NOTE_COLOR_IDS.map((color) => dark[color]);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('blendNoteToneOverBackground', () => {
  it('смешивает полупрозрачный тон с фоном в непрозрачный цвет', () => {
    // 0.5 прозрачности между белым фоном и чёрным тоном даёт серый.
    expect(blendNoteToneOverBackground('rgba(0, 0, 0, 0.5)', '#ffffff')).toBe('rgb(128, 128, 128)');
  });

  it('непрозрачный тон оставляет как есть', () => {
    expect(blendNoteToneOverBackground('#f2cd52', '#ffffff')).toBe('rgb(242, 205, 82)');
  });

  it('неизвестный формат возвращает исходное значение', () => {
    expect(blendNoteToneOverBackground('var(--x)', '#ffffff')).toBe('var(--x)');
  });
});

describe('solidNoteTones', () => {
  it('для каждого цвета даёт непрозрачный цвет, отличный от фона', () => {
    for (const palette of PALETTES) {
      const tones = readerThemeNoteTones(palette.id, 'dark');
      const background = readerThemeTokens(palette.id, 'dark').background;
      const solid = solidNoteTones(tones, background);
      for (const color of READER_NOTE_COLOR_IDS) {
        expect(solid[color]).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
        expect(solid[color]).not.toBe(background);
      }
    }
  });

  it('сохраняет различие цветов тёмной стороны', () => {
    const tones = readerThemeNoteTones('linen', 'dark');
    const solid = solidNoteTones(tones, readerThemeTokens('linen', 'dark').background);
    const values = READER_NOTE_COLOR_IDS.map((color) => solid[color]);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('гарнитура книги', () => {
  it('сохраняет допустимые значения', () => {
    expect(isReaderFontId('serif')).toBe(true);
    expect(isReaderFontId('sans')).toBe(true);
    expect(normalizeReaderFontId('sans')).toBe('sans');
  });

  it('неизвестное значение приводит к шрифту с засечками', () => {
    expect(DEFAULT_READER_FONT).toBe('serif');
    expect(isReaderFontId('mono')).toBe(false);
    expect(normalizeReaderFontId('mono')).toBe('serif');
    expect(normalizeReaderFontId(undefined)).toBe('serif');
  });

  it('семейство шрифта отличается у обеих гарнитур', () => {
    const serif = readerFontFamily('serif');
    const sans = readerFontFamily('sans');
    expect(serif).toContain('serif');
    expect(sans).toContain('system-ui');
    expect(serif).not.toBe(sans);
    for (const font of READER_FONTS) {
      expect(readerFontFamily(font).length).toBeGreaterThan(0);
    }
  });
});

describe('applyReaderFont', () => {
  it('выставляет атрибут data-reader-font', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyReaderFont('sans', root);

    expect(root.dataset.readerFont).toBe('sans');
  });

  it('неизвестную гарнитуру заменяет шрифтом с засечками', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyReaderFont('неизвестная', root);

    expect(root.dataset.readerFont).toBe('serif');
  });
});
