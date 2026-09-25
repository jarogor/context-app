//! Скелет словаря декларативного UI.
//!
//! Здесь фиксируются типы будущего дерева интерфейса, которое плагин будет
//! возвращать хосту, а хост — рендерить компонентами дизайн-системы. Реализация
//! рендерера и протокола — в следующих изменениях.

/** Версия схемы декларативного UI. */
export const UI_SCHEMA_VERSION = 1;

/** Узел дерева интерфейса. */
export type UiNode = UiElement | UiText;

/** Текстовый узел. */
export interface UiText {
  /** Дискриминант текстового узла. */
  type: '#text';
  /** Текст. */
  value: string;
}

/** Элемент дерева интерфейса. */
export interface UiElement {
  /** Имя компонента дизайн-системы. */
  type: string;
  /** Свойства компонента. */
  props?: Record<string, unknown>;
  /** Дочерние узлы. */
  children?: UiNode[];
  /** Обработчики событий: имя события -> идентификатор действия. */
  on?: Record<string, string>;
}

/** Свойства кнопки в дереве интерфейса. */
export interface ButtonProps {
  /** Подпись кнопки. */
  label: string;
  /** Вариант оформления. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Доступность. */
  disabled?: boolean;
}

/** Свойства поля ввода в дереве интерфейса. */
export interface FieldProps {
  /** Идентификатор значения. */
  name: string;
  /** Подпись поля. */
  label?: string;
  /** Текущее значение. */
  value?: string;
  /** Тип поля. */
  kind?: 'string' | 'number' | 'boolean' | 'select' | 'json';
}
