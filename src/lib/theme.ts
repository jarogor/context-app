/** Тема оформления оболочки: чтение предпочтения и применение к документу.
 *
 * Логика темы (тип предпочтения и разрешение в светлую/тёмную) принадлежит
 * дизайн-системе `@texture/ui`. Оболочка лишь читает сохранённое предпочтение
 * из ядра, применяет его и реагирует на изменение настроек. Модуль чист от
 * Svelte и пригоден для тестов.
 */

import {
  applyTheme,
  normalizeThemePreference,
  type ThemePreference,
  type UnsubscribeTheme,
} from '@texture/ui';
import { invokeCommand } from './app-bridge';

/** Секция настроек приложения, изменение которой может сменить тему. */
export const APP_SETTINGS_SECTION = 'app.general';

/** Ключ значения темы в секции настроек приложения. */
export const THEME_SETTING_KEY = 'appearance.theme';

/** Чтение сохранённого предпочтения темы из ядра.
 *
 * Неизвестное или отсутствующее значение приводится к `system`; ошибку чтения
 * вызывающий обрабатывает сам.
 */
export async function loadThemePreference(): Promise<ThemePreference> {
  const value = await invokeCommand('theme_preference', {});
  return normalizeThemePreference(value);
}

/** Применение предпочтения темы к документу.
 *
 * Возвращает функцию снятия подписки на тему операционной системы (для
 * `system`); вызывающий хранит её и снимает перед повторным применением.
 */
export function applyAppTheme(
  preference: unknown,
  root?: HTMLElement,
  media?: MediaQueryList,
): UnsubscribeTheme {
  return applyTheme(normalizeThemePreference(preference), root, media);
}

/** Активная подписка на тему операционной системы. */
let currentUnsubscribe: UnsubscribeTheme | null = null;

/** Применение темы с заменой прежней подписки.
 *
 * Тема применяется в нескольких местах (бутстрап, реакция на изменение
 * настроек). Хранение единственной подписки гарантирует, что переключение
 * предпочтения не оставит лишних слушателей темы ОС.
 */
export function applyAppThemeTracked(preference: unknown): void {
  currentUnsubscribe?.();
  currentUnsubscribe = applyAppTheme(preference);
}

/** Извлечение темы из события `settings:changed`.
 *
 * Возвращает предпочтение только для секции приложения; для других секций или
 * при отсутствии значения — `null`, чтобы оболочка не трогала тему зря.
 */
export function themeFromSettingsEvent(payload: unknown): ThemePreference | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const event = payload as { section?: unknown; values?: Record<string, unknown> };
  if (event.section !== APP_SETTINGS_SECTION) {
    return null;
  }
  const value = event.values?.[THEME_SETTING_KEY];
  return value === undefined ? null : normalizeThemePreference(value);
}
