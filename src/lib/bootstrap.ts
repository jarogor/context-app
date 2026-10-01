/** Загрузка начального состояния приложения до первого рендера.
 *
 * Рабочее место — точка входа приложения, поэтому реестр рабочих мест и сведения
 * об активной библиотеке загружаются **до** монтирования оболочки. Тогда при
 * первом рендере список рабочих мест уже готов: нет промежутка, в котором
 * показывается стартовая страница или пустой список, и нельзя случайно нажать
 * то, что ещё не загрузилось. Ошибка загрузки — отдельное состояние: она не
 * выглядит как «рабочих мест нет».
 *
 * Модуль чист от Svelte и пригоден для тестов.
 */

import { invokeCommand } from './app-bridge';

/** Активная библиотека для шапки. */
export interface ActiveLibrary {
    /** Человекочитаемое имя провайдера. */
    provider_name?: string;
    /** Путь библиотеки. */
    path?: string;
}

/** Загруженное начальное состояние приложения. */
export interface BootstrapState {
    /** Снимок реестра рабочих мест из ядра (нормализует вызывающий). */
    registry: unknown;
    /** Активная библиотека или null, когда библиотека не открыта. */
    activeLibrary: ActiveLibrary | null;
}

/** Загрузка начального состояния приложения: реестр рабочих мест и библиотека.
 *
 * Сведения о библиотеке необязательны — при ошибке она считается не открытой;
 * ошибка реестра рабочих мест пробрасывается, потому что от неё зависит
 * отображение точки входа.
 */
export async function loadBootstrap(): Promise<BootstrapState> {
    const [registry, library] = await Promise.all([
        invokeCommand('get_workspaces', {}),
        loadActiveLibrary(),
    ]);
    return { registry, activeLibrary: library };
}

/** Загрузка сведений об активной библиотеке; ошибка даёт «не открыта». */
async function loadActiveLibrary(): Promise<ActiveLibrary | null> {
    try {
        const result = (await invokeCommand('active_library', {})) as ActiveLibrary | null;
        return result?.path ? result : null;
    } catch {
        return null;
    }
}
