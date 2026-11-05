/** Эфемерное состояние контролов декларативного интерфейса.
 *
 * Хост хранит введённые пользователем значения до отправки действия плагину, а
 * источником истины остаётся плагин: после интента приходит свежая декларация,
 * и значения пересобираются из неё. Модуль чист от Svelte и пригоден для тестов.
 */

import type { UiElement, UiNode } from '@context/ui-schema';
import { isUiText } from '@context/ui-schema';

/** Ключ контрола в карте значений: имя, объявленное свойством `name`. */
function controlName(node: UiElement): string | null {
  const name = node.props?.name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

/** Начальное значение контрола из его свойств. */
function initialValue(node: UiElement): unknown {
  if (node.type === 'Checkbox') {
    return node.props?.checked === true;
  }
  const value = node.props?.value;
  return value === undefined || value === null ? '' : value;
}

/** Пересборка карты значений из узлов декларации. */
export function collectValues(
  nodes: UiNode[],
  into: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const node of nodes) {
    if (isUiText(node)) {
      continue;
    }
    const name = controlName(node);
    if (name && !(name in into)) {
      into[name] = initialValue(node);
    }
    if (node.children && node.children.length > 0) {
      collectValues(node.children, into);
    }
  }
  return into;
}

/** Снимок текущих значений для передачи плагину в интенте. */
export function snapshot(values: Record<string, unknown>): Record<string, unknown> {
  return { ...values };
}
