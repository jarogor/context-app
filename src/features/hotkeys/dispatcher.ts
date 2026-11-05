/** Единый диспетчер клавиатуры приложения.
 *
 * Все комбинации приходят сюда одним слушателем `keydown` и разбираются общим
 * реестром. Обработчики действий регистрируют области приложения, и этим же
 * объявляют свою доступность: пока обработчики области зарегистрированы, её
 * действия доступны. Поэтому «кто первый подписался» ничего не решает, а одно
 * сочетание не может сработать в двух местах.
 *
 * Дополнительно диспетчер:
 * - не перехватывает комбинации из поля ввода, если у действия нет модификатора
 *   и оно не разрешено в поле (иначе `Home` в строке поиска уводил бы к началу
 *   книги);
 * - не перехватывает событие, которое уже отменили (открытый диалог, меню);
 * - уступает клавишу, если обработчик вернул `false` (закрывать было нечего);
 * - после выполненного действия помечает событие использованным
 *   (`preventDefault`), чтобы браузер не прокручивал страницу и не открывал свои
 *   диалоги;
 * - в модальном окне пропускает только закрытие слоя: остальные комбинации не
 *   меняют состояние за диалогом;
 * - принимает нажатия, пересланные документом книги: фокус в `iframe` не отдаёт
 *   события окну, поэтому книга пересылает сырое нажатие, а разбор остаётся
 *   здесь — единственным.
 *
 * Модуль чист от Svelte: обработчики — обычные функции, а подключение к окну
 * делает оболочка.
 */

import { HOTKEY_ACTIONS_BY_ID, type HotkeyScope } from './actions';
import {
  comboDescriptor,
  comboOfEvent,
  isNativeScrollCombo,
  isOwnScrollTarget,
  isTextInputTarget,
  type ComboDescriptor,
  type KeyCombo,
} from './key-combo';
import {
  createHotkeyRegistry,
  findHotkey,
  type HotkeyBinding,
  type HotkeyOverrides,
  type HotkeyRegistry,
} from './registry';

/** Идентификатор действия закрытия верхнего слоя. */
export const DISMISS_ACTION_ID = 'app.dismiss';

/** Обработчик действия.
 *
 * `false` означает «действие сейчас не выполнено» (закрывать было нечего,
 * чтения нет): клавиша не считается использованной и остаётся свободной.
 */
export type HotkeyHandler = (event: KeyboardEvent) => boolean | void;

/** Включённое действие: его привязка и обработчик. */
interface EnabledAction {
  /** Привязка, которой соответствует действие. */
  binding: HotkeyBinding;
  /** Обработчик, зарегистрированный областью. */
  handler: HotkeyHandler;
}

/** Диспетчер клавиатуры приложения. */
export interface HotkeyDispatcher {
  /** Регистрация обработчиков области; возвращает снятие регистрации. */
  register: (scope: HotkeyScope, handlers: Readonly<Record<string, HotkeyHandler>>) => () => void;
  /** Обработка события `keydown`; `true` — клавиша принадлежала приложению. */
  handle: (event: KeyboardEvent) => boolean;
  /** Обработка нажатия, пересланного документом книги (фокус был в книге). */
  handleViewer: (combo: KeyCombo) => boolean;
  /** Выполнение действия, о котором сообщил плагин формата (`hotkey`). */
  handleViewerAction: (actionId: string) => boolean;
  /** Привязки, которые плагин формата должен распознать и не отдать браузеру. */
  viewerBindings: () => ComboDescriptor[];
  /** Модальное окно поверх приложения: доступно только закрытие слоя. */
  setModalOpen: (open: boolean) => void;
}

/** Создание диспетчера клавиатуры.
 *
 * `overrides` — будущая настраиваемость: сегодня приложение пользуется
 * значениями по умолчанию, поэтому реестр собирается один раз при создании.
 */
export function createHotkeyDispatcher(overrides: HotkeyOverrides = {}): HotkeyDispatcher {
  const registry: HotkeyRegistry = createHotkeyRegistry(undefined, overrides);
  const enabled = new Map<string, EnabledAction>();
  let modalOpen = false;

  /** Доступна ли область действия: в ней зарегистрирован хотя бы один обработчик. */
  function scopeAvailable(scope: HotkeyScope): boolean {
    for (const entry of enabled.values()) {
      if (entry.binding.action.scope === scope) {
        return true;
      }
    }
    return false;
  }

  /** Включённое действие, если его область сейчас доступна. */
  function enabledAction(binding: HotkeyBinding): EnabledAction | null {
    const entry = enabled.get(binding.action.id);
    if (!entry || !scopeAvailable(binding.action.scope)) {
      return null;
    }
    return entry;
  }

  /** Комбинация может сработать из поля ввода текста. */
  function allowedInTextInput(binding: HotkeyBinding, combo: KeyCombo): boolean {
    if (binding.action.allowInTextInput) {
      return true;
    }
    // Модифицированная комбинация — команда, а не набор текста: она не мешает
    // правке поля и работает как везде в приложении.
    return combo.ctrl || combo.alt || combo.meta;
  }

  /** Выполнение привязки; `false` — действие сейчас не выполнено. */
  function execute(binding: HotkeyBinding, event: KeyboardEvent): boolean {
    const entry = enabledAction(binding);
    if (!entry) {
      return false;
    }
    if (modalOpen && binding.action.id !== DISMISS_ACTION_ID) {
      return false;
    }
    if (entry.handler(event) === false) {
      return false;
    }
    event.preventDefault();
    return true;
  }

  return {
    register(scope, handlers) {
      const registered: Array<{ id: string; handler: HotkeyHandler }> = [];
      for (const [id, handler] of Object.entries(handlers)) {
        const action = HOTKEY_ACTIONS_BY_ID.get(id);
        if (!action) {
          throw new Error(`обработчик неизвестного действия комбинаций клавиш: ${id}`);
        }
        if (action.scope !== scope) {
          throw new Error(
            `действие ${id} принадлежит области ${action.scope}, а зарегистрировано в ${scope}`,
          );
        }
        const binding = registry.bindings.find((item) => item.action.id === id);
        if (!binding) {
          throw new Error(`у действия ${id} нет привязки`);
        }
        enabled.set(id, { binding, handler });
        registered.push({ id, handler });
      }
      return () => {
        for (const item of registered) {
          // Снятие убирает только СВОЙ обработчик: при переключении вкладок
          // старая читалка размонтируется уже после того, как новая заняла
          // действие, и слепое удаление по идентификатору снимало бы новую.
          const current = enabled.get(item.id);
          if (current?.handler === item.handler) {
            enabled.delete(item.id);
          }
        }
      };
    },

    handle(event) {
      if (event.defaultPrevented) {
        return false;
      }
      const combo = comboOfEvent(event);
      const binding = findHotkey(combo, registry);
      if (!binding) {
        return false;
      }
      if (isTextInputTarget(event.target) && !allowedInTextInput(binding, combo)) {
        return false;
      }
      // «Голые» прокруточные клавиши в списке или панели принадлежат ей: она
      // прокручивается сама, и книга не должна листаться вместо неё.
      if (isNativeScrollCombo(combo) && isOwnScrollTarget(event.target)) {
        return false;
      }
      return execute(binding, event);
    },

    handleViewer(combo) {
      // Фокус был в книге: поля ввода приложения не затронуты, а сам документ
      // книги уже отсеял набор текста.
      const binding = findHotkey(combo, registry);
      if (!binding) {
        return false;
      }
      return execute(binding, new KeyboardEvent('keydown'));
    },

    handleViewerAction(actionId) {
      // Плагин формата уже сопоставил нажатие с привязкой по данным приложения:
      // второго разбора здесь нет, только проверка области и обработчика.
      const entry = enabled.get(actionId);
      if (!entry) {
        return false;
      }
      return execute(entry.binding, new KeyboardEvent('keydown'));
    },

    viewerBindings() {
      // Плагину нужны ВСЕ привязки, а не только «читальные»: пока фокус остаётся
      // в книге, команды оболочки и рабочего места тоже должны срабатывать,
      // иначе они работали бы только после клика мимо книги.
      return registry.bindings.map((binding) => comboDescriptor(binding.action.id, binding.combo));
    },

    setModalOpen(open) {
      modalOpen = open;
    },
  };
}
