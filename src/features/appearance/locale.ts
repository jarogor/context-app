/** Язык интерфейса оболочки: чтение настройки, применение и реакция на смену.
 *
 * Владелец набора языков и словарей — пакет `@context/i18n`. Оболочка лишь
 * читает сохранённый язык из ядра на бутстрапе, применяет его к документу и
 * повторяет это по событию `settings:changed`. Модуль чист от Svelte.
 */

import { applyLocale, normalizeLocale, setLocale, t, type Locale } from '@context/i18n';
import { invokeCommand } from '../../shared/app-bridge';
import { APP_SETTINGS_SECTION } from './theme';

/** Ключ языка интерфейса в секции настроек приложения. */
export const LANGUAGE_SETTING_KEY = 'appearance.language';

/** Ключ языка для статичного экрана загрузки до бандла. */
export const BOOT_LOCALE_KEY = 'context.locale';

/** Применение языка ко всему интерфейсу: реактивное состояние и документ.
 *
 * Обновляются и `lang` документа (нужен экранным дикторам и переносам), и
 * состояние переводов, из которого читают компоненты. Обе части обязаны идти
 * вместе, поэтому вход один. Язык дублируется в `localStorage` для статичного
 * экрана загрузки следующего запуска: до бандла словари недоступны.
 */
export function applyAppLocale(value: unknown): Locale {
  const locale = normalizeLocale(value);
  setLocale(locale);
  applyLocale(locale);
  persistBootLocale(locale);
  void applyAppName();
  return locale;
}

/** Применение имени приложения к заголовку окна и документа.
 *
 * Имя — такой же текст интерфейса, как и остальные: «Контекст» по-русски и
 * «Context» по-английски. Заголовок окна ставит ядро (оно владеет окном), а
 * `<title>` документа — сам документ; значения берутся из одного словаря, чтобы
 * они не разошлись. Ошибка ядра не ломает интерфейс: имя остаётся в `<title>`.
 */
async function applyAppName(): Promise<void> {
  const name = t('app.name');
  if (typeof document !== 'undefined') {
    document.title = name;
  }
  try {
    // Одним проходом обновляются и окно, и сведения о приложении: имя живёт в
    // двух местах ядра, и расхождение между ними было бы заметно.
    await Promise.all([
      invokeCommand('app_title_set', { title: name }),
      invokeCommand('app_name_set', { name }),
    ]);
  } catch {
    // Окно может быть ещё не создано (тесты без Tauri): имя в документе уже есть.
  }
}

/** Сохранение языка для статичного экрана загрузки следующего запуска. */
export function persistBootLocale(locale: Locale): void {
  try {
    localStorage.setItem(BOOT_LOCALE_KEY, locale);
  } catch {
    // Недоступное хранилище не мешает применению языка в текущей сессии.
  }
}

/** Чтение сохранённого языка экрана загрузки; `null` — данных нет. */
export function readBootLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(BOOT_LOCALE_KEY);
    return raw ? normalizeLocale(raw) : null;
  } catch {
    return null;
  }
}

/** Чтение сохранённого языка интерфейса из ядра.
 *
 * Ошибку чтения обрабатывает вызывающий; значение нормализуется.
 */
export async function loadInterfaceLocale(): Promise<Locale> {
  const value = await invokeCommand('interface_locale', {});
  return normalizeLocale(value);
}

/** Извлечение языка из события `settings:changed`.
 *
 * Возвращает язык только для секции приложения и только когда значение в
 * событии присутствует; иначе — `null`, чтобы оболочка не меняла язык зря.
 */
export function localeFromSettingsEvent(payload: unknown): Locale | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const event = payload as { section?: unknown; values?: Record<string, unknown> };
  if (event.section !== APP_SETTINGS_SECTION) {
    return null;
  }
  const value = event.values?.[LANGUAGE_SETTING_KEY];
  return value === undefined ? null : normalizeLocale(value);
}
