import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAppPalette,
  applyAppReaderTheme,
  applyAppTheme,
  loadReaderTheme,
  loadThemePalette,
  loadThemePreference,
  paletteFromSettingsEvent,
  readerThemeFromSettingsEvent,
  themeFromSettingsEvent,
  APP_SETTINGS_SECTION,
} from './theme';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
}));

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
  invoke.mockReset();
});

/** Поддельный список медиа-запросов с управляемой подпиской. */
function fakeMedia(
  initialDark: boolean,
): MediaQueryList & { emit: (matches: boolean) => void; readonly size: number } {
  const listeners = new Set<() => void>();
  const media = {
    matches: initialDark,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
    emit(matches: boolean) {
      media.matches = matches;
      for (const listener of listeners) {
        listener();
      }
    },
    get size() {
      return listeners.size;
    },
  };
  return media as unknown as MediaQueryList & {
    emit: (matches: boolean) => void;
    readonly size: number;
  };
}

describe('loadThemePreference', () => {
  it('возвращает сохранённое предпочтение', async () => {
    invoke.mockResolvedValue('dark');

    await expect(loadThemePreference()).resolves.toBe('dark');
    expect(invoke).toHaveBeenCalledWith('theme_preference', {});
  });

  it('приводит неизвестное значение к system', async () => {
    invoke.mockResolvedValue('sepia');

    await expect(loadThemePreference()).resolves.toBe('system');
  });
});

describe('loadThemePalette', () => {
  it('возвращает сохранённую палитру', async () => {
    invoke.mockResolvedValue('cobalt');

    await expect(loadThemePalette()).resolves.toBe('cobalt');
    expect(invoke).toHaveBeenCalledWith('theme_palette', {});
  });

  it('приводит неизвестное значение к палитре по умолчанию', async () => {
    invoke.mockResolvedValue('solarized');

    await expect(loadThemePalette()).resolves.toBe('linen');
  });
});

describe('loadReaderTheme', () => {
  it('возвращает сохранённую тему области чтения', async () => {
    invoke.mockResolvedValue('dark');

    await expect(loadReaderTheme()).resolves.toBe('dark');
    expect(invoke).toHaveBeenCalledWith('reader_theme', {});
  });

  it('приводит неизвестное значение к светлой теме', async () => {
    invoke.mockResolvedValue('sepia');

    await expect(loadReaderTheme()).resolves.toBe('light');
  });
});

describe('applyAppReaderTheme', () => {
  it('выставляет data-reader-theme', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyAppReaderTheme('dark', root);

    expect(root.dataset.readerTheme).toBe('dark');
  });

  it('неизвестную тему заменяет светлой', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyAppReaderTheme('неизвестно', root);

    expect(root.dataset.readerTheme).toBe('light');
  });
});

describe('applyAppPalette', () => {
  it('выставляет data-palette', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyAppPalette('cobalt', root);

    expect(root.dataset.palette).toBe('cobalt');
  });

  it('неизвестную палитру заменяет значением по умолчанию', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyAppPalette('неизвестно', root);

    expect(root.dataset.palette).toBe('linen');
  });
});

describe('applyAppTheme', () => {
  it('выставляет data-theme для явной темы', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyAppTheme('dark', root, fakeMedia(false));

    expect(root.dataset.theme).toBe('dark');
  });

  it('разрешает system по теме ОС и следит за ней', () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    const media = fakeMedia(false);

    const unsubscribe = applyAppTheme('system', root, media);
    expect(root.dataset.theme).toBe('light');
    expect(media.size).toBe(1);

    media.emit(true);
    expect(root.dataset.theme).toBe('dark');

    unsubscribe();
    expect(media.size).toBe(0);
  });

  it('неизвестное предпочтение трактуется как system', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyAppTheme('неизвестно', root, fakeMedia(true));

    expect(root.dataset.theme).toBe('dark');
  });
});

describe('themeFromSettingsEvent', () => {
  it('извлекает тему из события секции приложения', () => {
    const value = themeFromSettingsEvent({
      section: APP_SETTINGS_SECTION,
      values: { 'appearance.theme': 'light' },
    });

    expect(value).toBe('light');
  });

  it('игнорирует события других секций', () => {
    const value = themeFromSettingsEvent({
      section: 'books-source.catalog',
      values: { 'appearance.theme': 'dark' },
    });

    expect(value).toBeNull();
  });

  it('возвращает null, если значение темы отсутствует', () => {
    expect(
      themeFromSettingsEvent({ section: APP_SETTINGS_SECTION, values: {} }),
    ).toBeNull();
    expect(themeFromSettingsEvent(null)).toBeNull();
  });
});

describe('paletteFromSettingsEvent', () => {
  it('извлекает палитру из события секции приложения', () => {
    const value = paletteFromSettingsEvent({
      section: APP_SETTINGS_SECTION,
      values: { 'appearance.palette': 'cobalt' },
    });

    expect(value).toBe('cobalt');
  });

  it('игнорирует события других секций', () => {
    const value = paletteFromSettingsEvent({
      section: 'books-source.catalog',
      values: { 'appearance.palette': 'cobalt' },
    });

    expect(value).toBeNull();
  });

  it('возвращает null, если значение палитры отсутствует', () => {
    expect(
      paletteFromSettingsEvent({ section: APP_SETTINGS_SECTION, values: {} }),
    ).toBeNull();
    expect(paletteFromSettingsEvent(null)).toBeNull();
  });
});

describe('readerThemeFromSettingsEvent', () => {
  it('извлекает тему области чтения из события секции приложения', () => {
    const value = readerThemeFromSettingsEvent({
      section: APP_SETTINGS_SECTION,
      values: { 'reader.theme': 'dark' },
    });

    expect(value).toBe('dark');
  });

  it('игнорирует события других секций', () => {
    const value = readerThemeFromSettingsEvent({
      section: 'books-source.catalog',
      values: { 'reader.theme': 'dark' },
    });

    expect(value).toBeNull();
  });

  it('возвращает null, если значение темы области чтения отсутствует', () => {
    expect(
      readerThemeFromSettingsEvent({ section: APP_SETTINGS_SECTION, values: {} }),
    ).toBeNull();
    expect(readerThemeFromSettingsEvent(null)).toBeNull();
  });
});
