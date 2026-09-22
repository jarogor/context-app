/** Типы данных, соответствующие моделям базового плагина настроек. */

/** Тип поля настроек. */
export type FieldType = 'boolean' | 'string' | 'number' | 'select' | 'json';

/** Вариант выбора для поля типа `select`. */
export interface FieldOption {
  /** Значение варианта. */
  value: unknown;
  /** Человекочитаемое название варианта. */
  title: string;
}

/** Поле настроек секции. */
export interface Field {
  /** Ключ значения в секции. */
  key: string;
  /** Человекочитаемое название поля. */
  title: string;
  /** Тип поля. */
  type: FieldType;
  /** Описание поля. */
  description?: string | null;
  /** Значение по умолчанию. */
  default?: unknown;
  /** Варианты выбора для типа `select`. */
  options?: FieldOption[];
}

/** Секция настроек, зарегистрированная владельцем. */
export interface Section {
  /** Полный идентификатор секции в формате `<owner>.<id>`. */
  id: string;
  /** Имя владельца секции. */
  owner: string;
  /** Категория владельца. */
  kind: string;
  /** Заголовок секции. */
  title: string;
  /** Описание секции. */
  description?: string | null;
  /** Поля секции. */
  fields: Field[];
  /** Текущие значения секции. */
  values: Record<string, unknown>;
}
