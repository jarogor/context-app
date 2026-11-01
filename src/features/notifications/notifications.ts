/** Обращения оболочки к журналу уведомлений и настройкам плагина уведомлений.
 *
 * Лента уведомлений — встроенная область приложения. Данные журнала
 * оболочка получает через непрозрачные операции базового плагина уведомлений и
 * не знает устройства журнала.
 */

import { invokeCommand } from '../../shared/app-bridge';

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

/** Вызов непрозрачной операции базового плагина. */
async function operation<T>(capability: string, action: string, payload: unknown = {}): Promise<T> {
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

/** Публикация пользовательского уведомления в журнал.
 *
 * Текст и подробности попадают в ленту уведомлений; вызывающий отвечает за
 * дедупликацию, чтобы не публиковать одно и то же повторно.
 */
export async function publishUserNotification(payload: {
    /** Текст сообщения. */
    message: string;
    /** Степень серьёзности записи. */
    severity?: NotificationSeverity;
    /** Источник события. */
    source?: string;
    /** Дополнительные подробности события. */
    details?: Record<string, unknown>;
}): Promise<void> {
    await operation(JOURNAL_CAPABILITY, 'publish', {
        level: 'user',
        severity: payload.severity ?? 'info',
        message: payload.message,
        source: payload.source ?? 'core',
        details: payload.details ?? {},
    });
}

/** Полная очистка журнала уведомлений. */
export async function clearNotifications(): Promise<void> {
    await operation(JOURNAL_CAPABILITY, 'clear', {});
}


