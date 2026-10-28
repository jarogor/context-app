/** Клиент проверки и установки обновлений ядра.
 *
 * Ядро (приложение и каркасные плагины) обновляется одним пакетом. Прикладные
 * плагины обновляются через стор и описаны в `plugin-store.ts`.
 *
 * Модуль чист от Svelte и пригоден для тестов.
 */

import { invokeCommand } from '../../shared/app-bridge';

/** Источник обновлений ядра. */
export interface UpdateSource {
    /** Вид источника: файловый каталог или сетевой адрес. */
    kind: 'file' | 'network';
    /** Каталог или базовый адрес. */
    location: string;
}

/** Настройки обновлений. */
export interface UpdateConfig {
    /** Источник обновлений ядра. */
    source: UpdateSource | null;
    /** Проверять обновления при запуске. */
    check_on_startup: boolean;
    /** Версия, которую пользователь попросил не предлагать. */
    skipped_version?: string | null;
}

/** Доступное обновление ядра. */
export interface AvailableCore {
    /** Текущая версия приложения. */
    current_version: string;
    /** Версия предлагаемого выпуска. */
    version: string;
    /** Заметки о выпуске. */
    notes: string;
    /** Способ установки. */
    mode: string;
}

/** Результат проверки обновлений ядра. */
export interface UpdateCheck {
    /** Настроенный источник. */
    source: UpdateSource | null;
    /** Доступное обновление ядра. */
    core: AvailableCore | null;
    /** Время проверки в миллисекундах Unix. */
    checked_at_millis: number;
    /** Ошибки чтения источника. */
    errors: string[];
}

/** Снимок состояния обновлений. */
export interface UpdateStatus {
    /** Текущая версия приложения. */
    current_version: string;
    /** Настройки обновлений. */
    config: UpdateConfig;
    /** Результат последней проверки. */
    last_check: UpdateCheck | null;
}

/** Результат подготовки обновления ядра. */
export interface ApplyOutcome {
    /** Версия подготовленного выпуска. */
    version: string;
    /** Требуется ли перезапуск. */
    restart_required: boolean;
    /** Путь к журналу применения. */
    log_path: string;
}

/** Состояние обновлений, загруженное до первого рендера. */
export interface UpdateBootstrap {
    /** Снимок состояния обновлений. */
    status: UpdateStatus | null;
    /** Ошибка загрузки состояния. */
    error: string;
}

/** Загрузка состояния обновлений. */
export async function loadUpdateStatus(): Promise<UpdateStatus> {
    return (await invokeCommand('update_status', {})) as UpdateStatus;
}

/** Сохранение источника обновлений ядра. */
export async function saveUpdateSource(source: UpdateSource): Promise<UpdateConfig> {
    return (await invokeCommand('update_source_set', { source })) as UpdateConfig;
}

/** Сброс источника обновлений ядра. */
export async function clearUpdateSource(): Promise<UpdateConfig> {
    return (await invokeCommand('update_source_clear', {})) as UpdateConfig;
}

/** Включение или выключение проверки при запуске. */
export async function saveCheckOnStartup(enabled: boolean): Promise<UpdateConfig> {
    return (await invokeCommand('update_check_on_startup_set', { enabled })) as UpdateConfig;
}

/** Проверка обновления ядра. */
export async function checkCoreUpdate(): Promise<UpdateCheck> {
    return (await invokeCommand('update_check', {})) as UpdateCheck;
}

/** Подготовка и запуск установки обновления ядра. */
export async function applyCoreUpdate(): Promise<ApplyOutcome> {
    return (await invokeCommand('update_apply', {})) as ApplyOutcome;
}

/** Отказ от предлагаемой версии ядра. */
export async function skipCoreUpdate(version: string): Promise<UpdateConfig> {
    return (await invokeCommand('update_skip', { version })) as UpdateConfig;
}

/** Перезапуск приложения после обновления прикладных плагинов. */
export async function restartApplication(): Promise<void> {
    await invokeCommand('update_restart', {});
}

/** Завершение приложения после подготовки обновления ядра.
 *
 * Замену файлов и повторный запуск выполняет помощник обновления.
 */
export async function quitForCoreUpdate(): Promise<void> {
    await invokeCommand('update_quit', {});
}
