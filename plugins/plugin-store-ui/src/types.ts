/** Описание установленного плагина, как его возвращает ядро. */
export interface InstalledPlugin {
  /** Имя плагина. */
  name: string;
  /** Категория плагина. */
  kind: string;
  /** Версия контракта плагина. */
  contract_version: number;
  /** Описание плагина. */
  description: string;
}

/** Вид провайдера стора. */
export type StoreKind = 'file' | 'network';

/** Подключённый стор. */
export interface Store {
  /** Уникальный идентификатор. */
  id: string;
  /** Вид провайдера. */
  kind: StoreKind | string;
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
  /** Путь к zip-пакету. */
  location: string;
}
