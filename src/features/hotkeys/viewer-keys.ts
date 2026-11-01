/** Клавиши книги в общем протоколе рабочего места.
 *
 * Плагин формата рисует книгу в песочнице и не видит реестр приложения, поэтому
 * **не трактует клавиши сам**: приложение присылает ему готовые описания
 * привязок, плагин распознаёт нажатие и сообщает, какое действие нажато, а
 * выполняет его приложение. Правил разбора комбинаций у плагина нет, и одно
 * действие не может означать разное в книге и в оболочке.
 *
 * Команда содержимому (`reader.screen.next`, `reader.book.start`, …) приходит
 * плагину после того, как приложение решило, что нажатие значит; прокрутку
 * выполняет тот, кто владеет страницами.
 *
 * Модуль чист от Svelte и общий для протокола рабочего места.
 */

/** Канал обмена области содержимого. */
export const VIEWER_CHANNEL = 'context-workplace';

/** Тип сообщения приложения плагину: привязки клавиш. */
export const VIEWER_BINDINGS_TYPE = 'hotkey-bindings';

/** Тип сообщения приложения плагину: выполнить действие над содержимым. */
export const VIEWER_COMMAND_TYPE = 'command';

/** Привязка клавиш, известная плагину формата.
 *
 * Плагин сравнивает поля события с этими описаниями: код клавиши физический (не
 * зависит от раскладки), модификаторы — булевы признаки. Правила сравнения
 * просты, а единственным источником привязок остаётся приложение.
 */
export interface ViewerBinding {
    /** Идентификатор действия приложения. */
    id: string;
    /** Физический код клавиши (`KeyboardEvent.code`). */
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

/** Сообщение приложения плагину со списком привязок. */
export interface ViewerBindingsMessage {
    /** Канал обмена области содержимого. */
    channel: string;
    /** Тип сообщения. */
    type: typeof VIEWER_BINDINGS_TYPE;
    /** Привязки в порядке каталога. */
    value: ViewerBinding[];
}

/** Сообщение приложению плагину с командой действия. */
export interface ViewerCommandMessage {
    /** Канал обмена области содержимого. */
    channel: string;
    /** Тип сообщения. */
    type: typeof VIEWER_COMMAND_TYPE;
    /** Значение: идентификатор действия. */
    value: { id: string };
}

/** Сообщение приложения плагину со списком привязок. */
export function viewerBindingsMessage(bindings: readonly ViewerBinding[]): ViewerBindingsMessage {
    return { channel: VIEWER_CHANNEL, type: VIEWER_BINDINGS_TYPE, value: [...bindings] };
}

/** Команда действия плагину. */
export function viewerCommand(id: string): ViewerCommandMessage {
    return { channel: VIEWER_CHANNEL, type: VIEWER_COMMAND_TYPE, value: { id } };
}
