/** Реестр привязок: какие комбинации назначены каким действиям.
 *
 * Реестр строится из каталога действий и проверяется один раз при загрузке:
 * одно сочетание не может быть назначено двум действиям. Ошибка обнаруживается
 * сразу, а не в момент нажатия, поэтому конфликт нельзя «не заметить»: при
 * добавлении новой привязки приложение не стартует, пока сочетание не освободят.
 *
 * Привязки по умолчанию — только значения по умолчанию: реестр принимает
 * переопределения отдельным аргументом, чтобы настраиваемость можно было
 * добавить, не меняя ни каталог, ни точки вызова.
 */

import { HOTKEY_ACTIONS, type HotkeyAction } from './actions';
import { comboId, formatCombo, parseCombo, type KeyCombo } from './key-combo';

/** Привязка комбинации к действию. */
export interface HotkeyBinding {
  /** Канонический идентификатор комбинации (`Ctrl+Shift+F`). */
  id: string;
  /** Комбинация клавиш. */
  combo: KeyCombo;
  /** Действие, которое она вызывает. */
  action: HotkeyAction;
}

/** Собранный реестр привязок. */
export interface HotkeyRegistry {
  /** Все привязки в порядке каталога. */
  bindings: readonly HotkeyBinding[];
  /** Поиск привязки по каноническому идентификатору комбинации. */
  byId: ReadonlyMap<string, HotkeyBinding>;
}

/** Переопределения привязок: идентификатор действия → список комбинаций.
 *
 * Пустой список снимает привязку с действия. Неизвестное действие — ошибка:
 * опечатка в идентификаторе иначе молча оставила бы действие без клавиш.
 */
export type HotkeyOverrides = Readonly<Record<string, readonly string[]>>;

/** Сборка реестра привязок с проверкой конфликтов.
 *
 * Проверяются: повтор идентификаторов действий, пустые списки комбинаций и
 * одно сочетание у двух действий. Любая из этих ошибок делает привязки
 * неоднозначными, поэтому реестр не собирается вовсе.
 */
export function createHotkeyRegistry(
  actions: readonly HotkeyAction[] = HOTKEY_ACTIONS,
  overrides: HotkeyOverrides = {},
): HotkeyRegistry {
  const actionsById = new Map<string, HotkeyAction>();
  for (const action of actions) {
    if (actionsById.has(action.id)) {
      throw new Error(`повторяющийся идентификатор действия комбинаций клавиш: ${action.id}`);
    }
    actionsById.set(action.id, action);
  }
  for (const id of Object.keys(overrides)) {
    if (!actionsById.has(id)) {
      throw new Error(`переопределение привязки для неизвестного действия: ${id}`);
    }
  }
  const bindings: HotkeyBinding[] = [];
  const byId = new Map<string, HotkeyBinding>();
  for (const action of actions) {
    const texts = overrides[action.id] ?? action.bindings;
    if (texts.length === 0) {
      throw new Error(`действие комбинаций клавиш без привязки: ${action.id}`);
    }
    for (const text of texts) {
      const combo = parseCombo(text);
      const id = comboId(combo);
      const existing = byId.get(id);
      if (existing) {
        throw new Error(
          `комбинация ${formatCombo(combo)} назначена двум действиям: ${existing.action.id} и ${action.id}`,
        );
      }
      const binding: HotkeyBinding = { id, combo, action };
      byId.set(id, binding);
      bindings.push(binding);
    }
  }
  return { bindings, byId };
}

/** Реестр привязок по умолчанию. */
export const HOTKEYS: HotkeyRegistry = createHotkeyRegistry();

/** Поиск действия по комбинации.
 *
 * Сравнение идёт по каноническому идентификатору: регистр букв и порядок
 * модификаторов не имеют значения, поэтому `Ctrl+Shift+F` и `Shift+Ctrl+f` —
 * одна комбинация.
 */
export function findHotkey(
  combo: KeyCombo,
  registry: HotkeyRegistry = HOTKEYS,
): HotkeyBinding | null {
  return registry.byId.get(comboId(combo)) ?? null;
}

/** Подпись комбинаций действия для подсказки или списка.
 *
 * У действия может быть несколько привязок (`Ctrl+Plus` и `Ctrl+Equal`):
 * в подписи они перечисляются через запятую.
 */
export function hotkeyLabel(actionId: string, registry: HotkeyRegistry = HOTKEYS): string {
  return registry.bindings
    .filter((binding) => binding.action.id === actionId)
    .map((binding) => formatCombo(binding.combo))
    .join(', ');
}

/** Подсказка кнопки с комбинацией: назначение и клавиша в скобках.
 *
 * Кнопка и клавиша делают одно и то же действие, поэтому подсказка кнопки
 * называет обе возможности. Действие без привязки остаётся с одним назначением.
 */
export function hotkeyHint(actionId: string, title: string): string {
  const label = hotkeyLabel(actionId);
  return label ? `${title} (${label})` : title;
}
