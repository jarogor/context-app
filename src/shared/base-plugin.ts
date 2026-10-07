/** Общий клиент базовых плагинов и активной библиотеки.
 *
 * Оболочка обращается к базовым плагинам только непрозрачными операциями по
 * capability: интерфейс не знает модели хранилища. Модуль чист от Svelte и
 * пригоден для тестов, поэтому клиенты заметок, настроек, уведомлений и стора
 * используют один канал, а не четыре одинаковые обёртки.
 */

import { invokeCommand } from './app-bridge';

/** Информация об активной библиотеке, отдаваемая ядром. */
export interface ActiveLibraryInfo {
  /** Провайдер (source-плагин) библиотеки, если задан. */
  provider_name?: string;
  /** Путь корня библиотеки. */
  path?: string;
  [key: string]: unknown;
}

/** Вызов непрозрачной операции произвольного базового плагина по capability. */
export async function basePluginOperation<T>(
  capability: string,
  action: string,
  payload: unknown = {},
): Promise<T> {
  return (await invokeCommand('invoke_base_plugin_operation', {
    capability,
    operation: action,
    payload,
  })) as T;
}

/** Текущая активная библиотека или `null`, если библиотека не выбрана. */
export async function activeLibrary(): Promise<ActiveLibraryInfo | null> {
  const result = (await invokeCommand('active_library', {})) as ActiveLibraryInfo | null;
  return result?.path ? result : null;
}
