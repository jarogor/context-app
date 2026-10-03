//! Обращения оболочки к журналу уведомлений и настройкам плагина уведомлений.
//!
//! Лента уведомлений — встроенная поверхность приложения. Данные журнала
//! оболочка получает через opaque-операции базового плагина уведомлений и не
//! знает устройства журнала.

import { invokeCommand } from './app-bridge';

/** Уровень записи журнала. */
export type NotificationLevel = 'User' | 'Technical';

/** Степень серьёзности записи. */
export type NotificationSeverity = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Запись журнала уведомлений. */
export interface NotificationEntry {
  /** Идентификатор записи. */
  id: number;
  /** Время записи в миллисекундах Unix. */
  timestamp: number;
  /** Уровень записи. */
  level: NotificationLevel;
  /** Степень серьёзности. */
  severity: NotificationSeverity;
  /** Текст сообщения. */
  message: string;
  /** Источник события. */
  source: string;
  /** Дополнительные детали события. */
  details: Record<string, unknown>;
  /** Прочитана ли запись. */
  read: boolean;
}

/** Capability базового плагина журнала уведомлений. */
const JOURNAL_CAPABILITY = 'notifications.journal@1';

/** Capability базового плагина настроек. */
const SETTINGS_CAPABILITY = 'settings.store@1';

/** Локальный идентификатор секции настроек плагина уведомлений. */
const SETTINGS_SECTION_LOCAL_ID = 'notifications';

/** Вызов opaque-операции базового плагина. */
async function operation<T>(
  capability: string,
  action: string,
  payload: unknown = {},
): Promise<T> {
  const result = await invokeCommand('invoke_base_plugin_operation', {
    capability,
    operation: action,
    payload,
  });
  return result as T;
}

/** Загрузка записей журнала уведомлений. */
export async function listNotifications(): Promise<NotificationEntry[]> {
  const data = await operation<{ entries: NotificationEntry[] }>(JOURNAL_CAPABILITY, 'list', {
    level: null,
  });
  return data.entries;
}

/** Пометка всех записей журнала прочитанными. */
export async function markAllNotificationsRead(): Promise<void> {
  await operation(JOURNAL_CAPABILITY, 'mark_all_read', {});
}

/** Полная очистка журнала уведомлений. */
export async function clearNotifications(): Promise<void> {
  await operation(JOURNAL_CAPABILITY, 'clear', {});
}

/** Начальное состояние технического уровня из настроек плагина уведомлений.
 *
 * Возвращает `null`, если секция настроек или значение не найдены: отсутствие
 * настройки не мешает панели уведомлений.
 */
export async function loadTechnicalVisibleDefault(): Promise<boolean | null> {
  const data = await operation<{
    sections?: { id: string; values?: { technical_visible_default?: unknown } }[];
  }>(SETTINGS_CAPABILITY, 'list', {});
  const section = data.sections?.find(
    (item) => item.id.split('.').pop() === SETTINGS_SECTION_LOCAL_ID,
  );
  return typeof section?.values?.technical_visible_default === 'boolean'
    ? section.values.technical_visible_default
    : null;
}
