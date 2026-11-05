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

import { t } from '@context/i18n';

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

/** Названия групп в порядке показа на активном языке. */
export const HOTKEY_GROUP_TITLES: Record<HotkeyGroup, string> = {
  get sections() {
    return t('app.hotkey.sections');
  },
  get workplace() {
    return t('app.hotkey.workplace');
  },
  get reading() {
    return t('app.hotkey.reading');
  },
  get layers() {
    return t('app.hotkey.layers');
  },
};

/** Каталог действий системы комбинаций клавиш. */
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  {
    id: 'app.section.workspace',
    title: 'app.hotkey.app.section.workspace.title',
    description: 'app.hotkey.app.section.workspace.description',
    group: 'sections',
    scope: 'app',
    bindings: ['Ctrl+1'],
  },
  {
    id: 'app.section.library',
    title: 'app.hotkey.app.section.library.title',
    description: 'app.hotkey.app.section.library.description',
    group: 'sections',
    scope: 'app',
    bindings: ['Ctrl+2'],
  },
  {
    id: 'app.section.notes',
    title: 'app.hotkey.app.section.notes.title',
    description: 'app.hotkey.app.section.notes.description',
    group: 'sections',
    scope: 'app',
    bindings: ['Ctrl+3'],
  },
  {
    id: 'app.settings',
    title: 'app.hotkey.app.settings.title',
    description: 'app.hotkey.app.settings.description',
    group: 'sections',
    scope: 'app',
    bindings: ['Ctrl+Comma'],
  },
  {
    id: 'app.theme',
    title: 'app.hotkey.app.theme.title',
    description: 'app.hotkey.app.theme.description',
    group: 'sections',
    scope: 'app',
    bindings: ['Ctrl+Alt+T'],
  },
  {
    id: 'workplace.books',
    title: 'app.hotkey.workplace.books.title',
    description: 'app.hotkey.workplace.books.description',
    group: 'workplace',
    scope: 'workplace',
    bindings: ['Ctrl+B'],
  },
  {
    id: 'workplace.notes',
    title: 'app.hotkey.workplace.notes.title',
    description: 'app.hotkey.workplace.notes.description',
    group: 'workplace',
    scope: 'workplace',
    bindings: ['Ctrl+J'],
  },
  {
    id: 'workplace.properties',
    title: 'app.hotkey.workplace.properties.title',
    description: 'app.hotkey.workplace.properties.description',
    group: 'workplace',
    scope: 'workplace',
    bindings: ['Ctrl+Shift+I'],
  },
  {
    id: 'workplace.focus',
    title: 'app.hotkey.workplace.focus.title',
    description: 'app.hotkey.workplace.focus.description',
    group: 'workplace',
    scope: 'workplace',
    bindings: ['Ctrl+Shift+F'],
  },
  {
    id: 'workplace.tab.next',
    title: 'app.hotkey.workplace.tab.next.title',
    description: 'app.hotkey.workplace.tab.next.description',
    group: 'workplace',
    scope: 'workplace',
    bindings: ['Ctrl+Tab'],
  },
  {
    id: 'workplace.tab.prev',
    title: 'app.hotkey.workplace.tab.prev.title',
    description: 'app.hotkey.workplace.tab.prev.description',
    group: 'workplace',
    scope: 'workplace',
    bindings: ['Ctrl+Shift+Tab'],
  },
  {
    id: 'workplace.add.book',
    title: 'app.hotkey.workplace.add.book.title',
    description: 'app.hotkey.workplace.add.book.description',
    group: 'workplace',
    scope: 'workplace',
    bindings: ['Ctrl+O'],
  },
  {
    id: 'reader.search',
    title: 'app.hotkey.reader.search.title',
    description: 'app.hotkey.reader.search.description',
    group: 'reading',
    scope: 'reader',
    bindings: ['Ctrl+F'],
  },
  {
    id: 'reader.search.next',
    title: 'app.hotkey.reader.search.next.title',
    description: 'app.hotkey.reader.search.next.description',
    group: 'reading',
    scope: 'reader',
    bindings: ['F3'],
    allowInTextInput: true,
  },
  {
    id: 'reader.search.prev',
    title: 'app.hotkey.reader.search.prev.title',
    description: 'app.hotkey.reader.search.prev.description',
    group: 'reading',
    scope: 'reader',
    bindings: ['Shift+F3'],
    allowInTextInput: true,
  },
  {
    id: 'reader.zoom.in',
    title: 'app.hotkey.reader.zoom.in.title',
    description: 'app.hotkey.reader.zoom.in.description',
    group: 'reading',
    scope: 'reader',
    bindings: ['Ctrl+Equal', 'Ctrl+NumpadAdd'],
  },
  {
    id: 'reader.zoom.out',
    title: 'app.hotkey.reader.zoom.out.title',
    description: 'app.hotkey.reader.zoom.out.description',
    group: 'reading',
    scope: 'reader',
    bindings: ['Ctrl+Minus', 'Ctrl+NumpadSubtract'],
  },
  {
    id: 'reader.screen.next',
    title: 'app.hotkey.reader.screen.next.title',
    description: 'app.hotkey.reader.screen.next.description',
    group: 'reading',
    scope: 'reader',
    bindings: ['PageDown'],
  },
  {
    id: 'reader.screen.prev',
    title: 'app.hotkey.reader.screen.prev.title',
    description: 'app.hotkey.reader.screen.prev.description',
    group: 'reading',
    scope: 'reader',
    bindings: ['PageUp'],
  },
  {
    id: 'reader.book.start',
    title: 'app.hotkey.reader.book.start.title',
    description: 'app.hotkey.reader.book.start.description',
    group: 'reading',
    scope: 'reader',
    bindings: ['Home'],
  },
  {
    id: 'reader.book.end',
    title: 'app.hotkey.reader.book.end.title',
    description: 'app.hotkey.reader.book.end.description',
    group: 'reading',
    scope: 'reader',
    bindings: ['End'],
  },
  {
    id: 'app.dismiss',
    title: 'app.hotkey.app.dismiss.title',
    description: 'app.hotkey.app.dismiss.description',
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
