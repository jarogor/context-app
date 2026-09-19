//! Типы данных, соответствующие сущностям бэкенда.

/** Уровень записи в журнале. */
export type Level = 'User' | 'Technical';

/** Степень серьёзности записи. */
export type Severity = 'Info' | 'Warn' | 'Error';

/** Запись в журнале уведомлений. */
export interface Entry {
    id: number;
    timestamp: number;
    level: Level;
    severity: Severity;
    message: string;
    source: string;
    details: Record<string, unknown>;
    read: boolean;
}
