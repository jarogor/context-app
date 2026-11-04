/** Клиент базового плагина стора.
 *
 * Управление плагинами — встроенная область приложения. Данные о плагинах,
 * сторах и неприменённых изменениях активности оболочка получает через
 * непрозрачные операции базового плагина стора и не знает его устройства. Модуль
 * чист от Svelte и пригоден для тестов.
 */

import { invokeCommand } from '../../shared/app-bridge';

/** Capability базового плагина стора. */
export const STORE_CAPABILITY = 'plugin-store@1';

/** Плагин в перечне стора с признаком активности. */
export interface PluginEntry {
  /** Стабильный идентификатор плагина. */
  id: string;
  /** Человекочитаемое имя плагина. */
  name: string;
  /** Версия плагина. */
  version?: string;
  /** Категория плагина. */
  kind: string;
  /** Описание плагина. */
  description: string;
  /** Включён ли плагин. */
  enabled: boolean;
  /** Можно ли удалить плагин. */
  removable: boolean;
  /** Является ли плагин образцом для разработчика. */
  sample?: boolean;
}

/** Подключённый стор. */
export interface Store {
  /** Уникальный идентификатор. */
  id: string;
  /** Вид провайдера. */
  kind: string;
  /** Человекочитаемое название. */
  title: string;
  /** Расположение: каталог или адрес. */
  location: string;
}

/** Пакет в индексе стора. */
export interface StorePackage {
  /** Имя пакета. */
  name: string;
  /** Версия пакета. */
  version?: string;
  /** Категория плагина. */
  kind?: string;
  /** Описание пакета. */
  description?: string;
  /** Идентификатор плагина. */
  id?: string;
  /** Контрольная сумма пакета. */
  sha256?: string;
  /** Путь к zip-пакету. */
  location: string;
}

/** Доступное обновление прикладного плагина. */
export interface PluginUpdate {
  /** Идентификатор стора. */
  store: string;
  /** Имя пакета. */
  name: string;
  /** Пакет из индекса стора. */
  package: StorePackage;
  /** Установленная версия. */
  current_version: string;
}

/** Перечень плагинов и реестр подключённых сторов. */
export interface StoreCatalog {
  /** Перечень отключаемых плагинов. */
  plugins: PluginEntry[];
  /** Реестр подключённых сторов. */
  stores: Store[];
}

/** Вызов непрозрачной операции базового плагина стора. */
async function operation<T>(action: string, payload: unknown = {}): Promise<T> {
  return (await invokeCommand('invoke_base_plugin_operation', {
    capability: STORE_CAPABILITY,
    operation: action,
    payload,
  })) as T;
}

/** Загрузка перечня плагинов и реестра сторов. */
export async function loadStoreCatalog(): Promise<StoreCatalog> {
  const catalog = await operation<{ plugins: PluginEntry[] }>('plugins', {});
  const registry = await operation<{ stores: Store[] }>('stores_list', {});
  return { plugins: catalog.plugins, stores: registry.stores };
}

/** Признак наличия неприменённых изменений активности плагинов. */
export async function loadActivationPending(): Promise<boolean> {
  const { pending } = (await invokeCommand('plugin_activation_pending', {})) as {
    pending: boolean;
  };
  return pending;
}

/** Переключение активности плагина. */
export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  await operation('set_enabled', { id, enabled });
}

/** Установка пакета из выбранного zip-файла. */
export async function installPluginFromFile(path: string): Promise<void> {
  await operation('install_file', { path });
}

/** Удаление установленного плагина. */
export async function uninstallPlugin(id: string): Promise<void> {
  await operation('uninstall', { id });
}

/** Добавление стора в реестр. */
export async function addStore(store: Store): Promise<void> {
  await operation('stores_add', { store });
}

/** Удаление стора из реестра. */
export async function removeStore(id: string): Promise<void> {
  await operation('stores_remove', { id });
}

/** Возврат встроенного источника обновлений плагинов. */
export async function resetPluginSource(): Promise<void> {
  await invokeCommand('plugin_source_clear', {});
}

/** Пакеты, предлагаемые стором; `supported === false` — сетевой стор не поддержан. */
export async function listStorePackages(
  id: string,
): Promise<{ supported: boolean; packages: StorePackage[] }> {
  const result = await operation<{ supported: boolean; packages?: StorePackage[] }>('available', {
    id,
  });
  return { supported: result.supported, packages: result.packages ?? [] };
}

/** Итог проверки обновлений плагинов. */
export interface PluginUpdates {
  /** Найденные обновления. */
  updates: PluginUpdate[];
  /**
   * Почему часть мест не проверена.
   *
   * Место без индекса пакетов — не поломка, а повод сказать об этом: иначе
   * пользователь видит «обновлений нет» и не понимает, что источник пуст.
   */
  errors: string[];
}

/** Доступные обновления прикладных плагинов во всех подключённых сторах. */
export async function listPluginUpdates(): Promise<PluginUpdates> {
  const result = await operation<{ updates?: PluginUpdate[]; errors?: string[] }>('updates', {});
  return { updates: result.updates ?? [], errors: result.errors ?? [] };
}

/** Установка или обновление плагина из стора. */
export async function updatePluginFromStore(store: string, name: string): Promise<void> {
  await operation('install_from_store', { id: store, name });
}
