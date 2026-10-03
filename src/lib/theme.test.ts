import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAppTheme,
  loadThemePreference,
  themeFromSettingsEvent,
  APP_SETTINGS_SECTION,
} from './theme';
import { invokeCommand } from './app-bridge';

vi.mock('./app-bridge', () => ({
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
      section: 'notifications.notifications',
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
