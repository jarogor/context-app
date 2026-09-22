/** Типы данных, соответствующие моделям базового плагина уведомлений. */

/** Уровень записи журнала. */
export type Level = 'User' | 'Technical';

/** Степень серьёзности записи. */
export type Severity = 'Info' | 'Warn' | 'Error';

/** Запись журнала уведомлений. */
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

/** Состояние региона уведомлений в оболочке приложения. */
export type LayoutState = 'collapsed' | 'expanded' | 'page';
