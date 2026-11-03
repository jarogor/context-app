/** Запись события интерфейса в журнал диагностики приложения.
 *
 * Ленты уведомлений в интерфейсе нет: всё, что раньше показывалось пользователю
 * плашкой, пишется в тот же файл `diagnostics.log`, что и техническая
 * диагностика. Отчёт поддержки собирается из него целиком.
 */

import { invokeCommand } from './app-bridge';

/** Степень серьёзности записи журнала. */
export type LogSeverity = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Событие интерфейса для записи в журнал. */
export interface AppLogEntry {
  /** Текст сообщения. */
  message: string;
  /** Степень серьёзности записи. */
  severity?: LogSeverity;
  /** Источник события. */
  source?: string;
  /** Дополнительные подробности события. */
  details?: Record<string, unknown>;
}

/** Запись события интерфейса в журнал диагностики.
 *
 * Ошибка записи не влияет на работу приложения: журнал описывает происходящее,
 * а не управляет им.
 */
export async function logEvent(entry: AppLogEntry): Promise<void> {
  await invokeCommand('app_log', {
    severity: entry.severity ?? 'info',
    message: entry.message,
    source: entry.source ?? 'core',
    details: entry.details ?? {},
  });
}
