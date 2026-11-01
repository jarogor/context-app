/** Каталог действий системы комбинаций клавиш.
 *
 * Единственный список всего, что можно вызвать с клавиатуры: разделы, панели
 * рабочего места, чтение, масштаб, поиск и закрытие верхнего слоя. Действие
 * описывается идентификатором, названием и привязками по умолчанию; обработчик
 * к нему привязывает та область, которая этим действием владеет.
 *
 * Комбинации уникальны **на всё приложение**, а не внутри области: одно
 * сочетание не может означать разное в разных местах (проверку делает реестр).
 * Область (`scope`) говорит лишь о том, где действие доступно: раздел, рабочее
 * место или чтение книги.
 *
 * Клавиши записываются физическими кодами (`event.code`) либо привычными
 * именами (`F`, `1`, `PageDown`): при русской раскладке сочетание должно
 * работать так же, как при английской.
 */

/** Область, в которой действие имеет смысл. */
export type HotkeyScope = 'app' | 'workplace' | 'reader';

/** Группа действий для показа списка комбинаций. */
export type HotkeyGroup = 'sections' | 'workplace' | 'reading' | 'layers';

/** Описание действия, которое можно вызвать с клавиатуры. */
export interface HotkeyAction {
    /** Устойчивый идентификатор действия (`reader.zoom.in`). */
    id: string;
    /** Название действия для человека. */
    title: string;
    /** Пояснение, что действие делает или когда доступно. */
    description?: string;
    /** Группа показа. */
    group: HotkeyGroup;
    /** Область действия. */
    scope: HotkeyScope;
    /** Привязки по умолчанию в записи `Ctrl+Shift+F`. */
    bindings: readonly string[];
    /** Срабатывает ли действие из поля ввода текста.
     *
     * По умолчанию нет: комбинация без модификатора набирает текст, и `Home` в
     * поле номера страницы не должен уводить к началу книги. Исключения — действия,
     * у которых нет текстового смысла: закрытие слоя (`Escape`) и переход по
     * найденному (`F3`).
     */
    allowInTextInput?: boolean;
}

/** Названия групп в порядке показа. */
export const HOTKEY_GROUP_TITLES: Record<HotkeyGroup, string> = {
    sections: 'Разделы и оболочка',
    workplace: 'Рабочее место',
    reading: 'Чтение книги',
    layers: 'Слои',
};

/** Каталог действий системы комбинаций клавиш. */
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
    {
        id: 'app.section.workspace',
        title: 'Рабочее место',
        description: 'Переход к рабочему месту, не меняя открытые вкладки',
        group: 'sections',
        scope: 'app',
        bindings: ['Ctrl+1'],
    },
    {
        id: 'app.section.library',
        title: 'Библиотека',
        description: 'Переход к библиотеке',
        group: 'sections',
        scope: 'app',
        bindings: ['Ctrl+2'],
    },
    {
        id: 'app.section.notes',
        title: 'Заметки',
        description: 'Переход к реестру заметок',
        group: 'sections',
        scope: 'app',
        bindings: ['Ctrl+3'],
    },
    {
        id: 'app.settings',
        title: 'Настройки',
        description: 'Открытие и закрытие настроек',
        group: 'sections',
        scope: 'app',
        bindings: ['Ctrl+Comma'],
    },
    {
        id: 'app.notifications',
        title: 'Уведомления',
        description: 'Открытие и закрытие журнала уведомлений',
        group: 'sections',
        scope: 'app',
        bindings: ['Ctrl+Alt+N'],
    },
    {
        id: 'app.theme',
        title: 'Тема оформления',
        description: 'Светлая, тёмная, как в системе — по кругу',
        group: 'sections',
        scope: 'app',
        bindings: ['Ctrl+Alt+T'],
    },
    {
        id: 'workplace.books',
        title: 'Панель открытых книг',
        description: 'Показ и скрытие списка открытых книг рабочего места',
        group: 'workplace',
        scope: 'workplace',
        bindings: ['Ctrl+B'],
    },
    {
        id: 'workplace.notes',
        title: 'Панель заметок',
        description: 'Показ и скрытие заметок открытой книги',
        group: 'workplace',
        scope: 'workplace',
        bindings: ['Ctrl+J'],
    },
    {
        id: 'workplace.focus',
        title: 'Сосредоточенное чтение',
        description: 'Скрытие панелей и чтение на всё окно',
        group: 'workplace',
        scope: 'workplace',
        bindings: ['Ctrl+Shift+F'],
    },
    {
        id: 'workplace.tab.next',
        title: 'Следующая вкладка',
        description: 'Переход к следующей открытой книге',
        group: 'workplace',
        scope: 'workplace',
        bindings: ['Ctrl+Tab'],
    },
    {
        id: 'workplace.tab.prev',
        title: 'Предыдущая вкладка',
        description: 'Переход к предыдущей открытой книге',
        group: 'workplace',
        scope: 'workplace',
        bindings: ['Ctrl+Shift+Tab'],
    },
    {
        id: 'workplace.add.book',
        title: 'Добавить книгу из файла',
        description: 'Выбор файла книги и открытие его вкладкой',
        group: 'workplace',
        scope: 'workplace',
        bindings: ['Ctrl+O'],
    },
    {
        id: 'reader.search',
        title: 'Поиск по книге',
        description: 'Открытие панели поиска по содержимому книги',
        group: 'reading',
        scope: 'reader',
        bindings: ['Ctrl+F'],
    },
    {
        id: 'reader.search.next',
        title: 'Следующее вхождение',
        description: 'Переход к следующему найденному месту в книге',
        group: 'reading',
        scope: 'reader',
        bindings: ['F3'],
        allowInTextInput: true,
    },
    {
        id: 'reader.search.prev',
        title: 'Предыдущее вхождение',
        description: 'Переход к предыдущему найденному месту в книге',
        group: 'reading',
        scope: 'reader',
        bindings: ['Shift+F3'],
        allowInTextInput: true,
    },
    {
        id: 'reader.zoom.in',
        title: 'Увеличить масштаб',
        description: 'Следующий уровень масштаба чтения',
        group: 'reading',
        scope: 'reader',
        bindings: ['Ctrl+Equal', 'Ctrl+NumpadAdd'],
    },
    {
        id: 'reader.zoom.out',
        title: 'Уменьшить масштаб',
        description: 'Предыдущий уровень масштаба чтения',
        group: 'reading',
        scope: 'reader',
        bindings: ['Ctrl+Minus', 'Ctrl+NumpadSubtract'],
    },
    {
        id: 'reader.screen.next',
        title: 'Следующий экран',
        description: 'Прокрутка книги вниз на высоту области чтения',
        group: 'reading',
        scope: 'reader',
        bindings: ['PageDown'],
    },
    {
        id: 'reader.screen.prev',
        title: 'Предыдущий экран',
        description: 'Прокрутка книги вверх на высоту области чтения',
        group: 'reading',
        scope: 'reader',
        bindings: ['PageUp'],
    },
    {
        id: 'reader.book.start',
        title: 'Начало книги',
        description: 'Прокрутка книги к самому началу',
        group: 'reading',
        scope: 'reader',
        bindings: ['Home'],
    },
    {
        id: 'reader.book.end',
        title: 'Конец книги',
        description: 'Прокрутка книги к самому концу',
        group: 'reading',
        scope: 'reader',
        bindings: ['End'],
    },
    {
        id: 'app.dismiss',
        title: 'Закрыть верхний слой',
        description: 'Закрывает открытый слой: настройки, поиск, меню заметки, правку',
        group: 'layers',
        scope: 'app',
        bindings: ['Escape'],
        allowInTextInput: true,
    },
];

/** Каталог по идентификатору действия. */
export const HOTKEY_ACTIONS_BY_ID: ReadonlyMap<string, HotkeyAction> = new Map(
    HOTKEY_ACTIONS.map((action) => [action.id, action]),
);
