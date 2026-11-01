import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(async () => 'en'),
}));

import { invokeCommand } from '../../shared/app-bridge';

const invoke = vi.mocked(invokeCommand);

import { setLocale } from '@context/i18n';
import {
  applyAppLocale,
  BOOT_LOCALE_KEY,
  LANGUAGE_SETTING_KEY,
  loadInterfaceLocale,
  localeFromSettingsEvent,
  readBootLocale,
} from './locale';

beforeEach(() => {
  localStorage.clear();
  setLocale('ru');
  invoke.mockClear();
});

describe('язык интерфейса', () => {
  it('применяет язык к документу и к переводам', () => {
    applyAppLocale('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dataset.locale).toBe('en');

    applyAppLocale('ru');
    expect(document.documentElement.lang).toBe('ru');
  });

  it('неизвестный язык приводит к русскому', () => {
    applyAppLocale('de');
    expect(document.documentElement.lang).toBe('ru');
  });

  it('переводит имя приложения и заголовок окна', () => {
    // Имя приложения — такой же текст интерфейса: русский «Контекст»,
    // английский «Context». Буква на знаке не переводится.
    applyAppLocale('en');
    expect(document.title).toBe('Context');
    expect(invoke).toHaveBeenCalledWith('app_title_set', { title: 'Context' });
    expect(invoke).toHaveBeenCalledWith('app_name_set', { name: 'Context' });

    applyAppLocale('ru');
    expect(document.title).toBe('Контекст');
    expect(invoke).toHaveBeenCalledWith('app_title_set', { title: 'Контекст' });
  });

  it('сохраняет язык для статичного экрана загрузки', () => {
    applyAppLocale('en');
    expect(localStorage.getItem(BOOT_LOCALE_KEY)).toBe('en');
    expect(readBootLocale()).toBe('en');
  });

  it('читает язык из ядра', async () => {
    // Клиент не толкует команду сам: значение нормализуется здесь.
    expect(await loadInterfaceLocale()).toBe('en');
  });

  it('извлекает язык из события настроек только для секции приложения', () => {
    expect(
      localeFromSettingsEvent({
        section: 'app.general',
        values: { [LANGUAGE_SETTING_KEY]: 'en' },
      }),
    ).toBe('en');
    expect(
      localeFromSettingsEvent({
        section: 'notifications.notifications',
        values: { [LANGUAGE_SETTING_KEY]: 'en' },
      }),
    ).toBeNull();
    expect(localeFromSettingsEvent({ section: 'app.general', values: {} })).toBeNull();
    expect(localeFromSettingsEvent(null)).toBeNull();
  });
});
