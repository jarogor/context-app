/** Клавиши книги в протоколе модуля рисования.
 *
 * Модуль рисования работает в песочнице и не видит реестр приложения, поэтому
 * приложение присылает ему **готовые описания привязок**, а модуль только
 * распознаёт нажатие и сообщает, какое действие нажато. Правил разбора
 * комбинаций у модуля нет: единственным источником привязок остаётся приложение,
 * и одно действие не может означать разное в книге и в оболочке.
 *
 * Действия над содержимым модуль выполняет по команде приложения: приложение
 * решает, что нажатие значит, а прокрутку делает тот, кто владеет страницами.
 *
 * Модуль самостоятелен (плагин не делит код с приложением), поэтому описание
 * привязки повторено здесь как часть протокола, а не импортировано из ядра.
 */

/** Канал обмена области содержимого. */
export const CHANNEL = 'context-workplace';

/** Тип сообщения приложения: список привязок клавиш. */
export const BINDINGS_TYPE = 'hotkey-bindings';

/** Тип сообщения приложения: выполнить действие над содержимым книги. */
export const COMMAND_TYPE = 'command';

/** Тип сообщения модуля: нажата привязанная комбинация. */
export const HOTKEY_TYPE = 'hotkey';

/** Привязка клавиш, присланная приложением.
 *
 * Сравнение идёт по физическому коду клавиши (`KeyboardEvent.code`): раскладка
 * на совпадение не влияет.
 */
export interface ViewerBinding {
  /** Идентификатор действия приложения. */
  id: string;
  /** Физический код клавиши. */
  code: string;
  /** Зажат ли Ctrl. */
  ctrl: boolean;
  /** Зажат ли Alt. */
  alt: boolean;
  /** Зажат ли Shift. */
  shift: boolean;
  /** Зажат ли Meta. */
  meta: boolean;
}

/** Сообщение приложения со списком привязок. */
export interface BindingsMessage {
  /** Тип сообщения. */
  type: typeof BINDINGS_TYPE;
  /** Привязки в порядке каталога приложения. */
  value: ViewerBinding[];
}

/** Сообщение приложения с командой действия. */
export interface CommandMessage {
  /** Тип сообщения. */
  type: typeof COMMAND_TYPE;
  /** Значение: идентификатор действия. */
  value: {
    /** Идентификатор действия приложения. */
    id?: string;
  };
}

/** Отправка сообщения приложению о нажатой комбинации. */
export function postHotkey(id: string): void {
  parent.postMessage({ channel: CHANNEL, type: HOTKEY_TYPE, value: { id } }, '*');
}

/** Проверка, что событие пришло из поля ввода текста или редактируемой области.
 *
 * Такие нажатия набирают текст, и модуль их не распознаёт: за поле ввода решает
 * оно само.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') {
    return false;
  }
  const editable = element.getAttribute('contenteditable');
  if (element.isContentEditable || (editable !== null && editable !== 'false')) {
    return true;
  }
  return /^(input|textarea|select)$/i.test(element.tagName);
}

/** Поиск привязки, совпавшей с событием клавиатуры.
 *
 * Сравниваются код клавиши и все четыре модификатора: иначе `Ctrl+PageDown` и
 * `PageDown` считались бы одной командой.
 */
export function matchBinding(
  bindings: readonly ViewerBinding[],
  event: KeyboardEvent,
): ViewerBinding | null {
  const code = event.code ?? '';
  if (!code) {
    return null;
  }
  for (const binding of bindings) {
    if (
      binding.code === code &&
      binding.ctrl === event.ctrlKey &&
      binding.alt === event.altKey &&
      binding.shift === event.shiftKey &&
      binding.meta === event.metaKey
    ) {
      return binding;
    }
  }
  return null;
}
