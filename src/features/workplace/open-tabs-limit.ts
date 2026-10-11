/** Лимит числа открытых вкладок рабочего места.
 *
 * Значение живёт в секции настроек приложения (`window.open_tabs_limit`) и
 * читается ядром. Модуль чист от Svelte: оболочка читает лимит на бутстрапе,
 * применяет его в поверхности рабочего места и обновляет по событию
 * `settings:changed` без перезапуска.
 */

import { invokeCommand } from '../../shared/app-bridge';
import { APP_SETTINGS_SECTION } from '../appearance/theme';
import { DEFAULT_OPEN_TABS_LIMIT, normalizeOpenTabsLimit } from './workplace';

/** Ключ значения лимита открытых вкладок в секции настроек приложения. */
export const OPEN_TABS_LIMIT_SETTING_KEY = 'window.open_tabs_limit';

/** Чтение лимита открытых вкладок из ядра.
 *
 * Ошибку чтения обрабатывает вызывающий; значение нормализуется (не меньше
 * единицы).
 */
export async function loadOpenTabsLimit(): Promise<number> {
  const value = await invokeCommand('window_open_tabs_limit', {});
  return normalizeOpenTabsLimit(value);
}

/** Извлечение лимита из события `settings:changed`.
 *
 * Возвращает число только для секции приложения и только когда значение в
 * событии присутствует; иначе — `null`, чтобы оболочка не меняла лимит зря.
 */
export function openTabsLimitFromSettingsEvent(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const event = payload as { section?: unknown; values?: Record<string, unknown> };
  if (event.section !== APP_SETTINGS_SECTION) {
    return null;
  }
  const value = event.values?.[OPEN_TABS_LIMIT_SETTING_KEY];
  return value === undefined ? null : normalizeOpenTabsLimit(value);
}

export { DEFAULT_OPEN_TABS_LIMIT };
