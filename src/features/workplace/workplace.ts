/** Состояние рабочего места: вкладки и активная вкладка.
 *
 * Модуль хранит чистые операции над вкладками, независимые от Svelte и IPC.
 * Вкладка — экземпляр открытия книги: дубликат книги получает собственный
 * идентификатор и собственное состояние чтения. Вложением вкладки служит путь к
 * файлу книги: рабочее место не знает, откуда книга — из библиотеки или выбрана
 * с диска.
 *
 * Вкладка может иметь необязательное пользовательское оформление (имя, описание,
 * иконка, цвет). Оформление дополняет существующее отображение, а не заменяет
 * его: незаданные поля ничего не меняют. Допустимые иконки ограничены набором
 * дизайн-системы, а цвет берётся из общей палитры заметок; неизвестные значения
 * отбрасываются при загрузке.
 */

import { TAB_ICON_NAMES } from '@texture/ui';
import { NOTE_COLORS, type NoteColor } from '../notes/model';

/** Допустимая вкладке иконка: подмножество набора иконок дизайн-системы. */
export type TabIconName = (typeof TAB_ICON_NAMES)[number];

/** Цвет оформления вкладки: общая палитра выбора цвета (`NOTE_COLORS`).
 *
 * Отдельного набора цветов у вкладки нет: выбор цвета — общий компонент
 * дизайн-системы с общей палитрой, поэтому вкладка переиспользует те же
 * идентификаторы и образцы, что и заметки.
 */
export type TabColor = NoteColor;

/** Идентификаторы допустимых цветов оформления вкладки — общая палитра. */
export const TAB_COLORS = NOTE_COLORS;

/** Ссылка на книгу для открытия вкладки: путь к файлу-вложению. */
export interface BookRef {
  /** Путь к файлу книги. */
  path: string;
  /** Название книги для отображения. */
  title: string;
  /** Формат книги. */
  format?: string;
}

/** Вкладка рабочего места. */
export interface WorkspaceTab {
  /** Идентификатор экземпляра вкладки. */
  id: string;
  /** Путь к файлу книги (вложение вкладки). */
  path: string;
  /** Название книги для отображения. */
  title: string;
  /** Формат книги. */
  format: string;
  /** Масштаб чтения в процентах. */
  zoom: number;
  /** Позиция чтения в процентах. */
  position: number;
  /** Режим чтения вкладки. */
  mode: string;
  /** Пользовательское имя вкладки; отсутствует, если не задано. */
  name?: string;
  /** Пользовательское описание вкладки; отсутствует, если не задано. */
  description?: string;
  /** Иконка оформления вкладки; отсутствует, если не задана. */
  icon?: TabIconName;
  /** Цвет оформления вкладки; отсутствует, если не задан. */
  color?: TabColor;
}

/** Правка пользовательского оформления вкладки. */
export interface TabAppearancePatch {
  /** Новое имя вкладки; `undefined` — снять имя. */
  name?: string;
  /** Новое описание вкладки; `undefined` — снять описание. */
  description?: string;
  /** Новая иконка вкладки; `undefined` — снять иконку. */
  icon?: string;
  /** Новый цвет вкладки; `undefined` — снять цвет. */
  color?: TabColor;
}

/** Состояние рабочего места. */
export interface WorkspaceState {
  /** Вкладки в порядке отображения. */
  tabs: WorkspaceTab[];
  /** Идентификатор активной вкладки. */
  activeTabId: string | null;
}

/** Доступность создания новых вкладок при текущем лимите. */
export type OpenAvailability = 'available' | 'limit-reached' | 'over-limit';

/** Значение лимита открытых вкладок по умолчанию. */
export const DEFAULT_OPEN_TABS_LIMIT = 50;

/** Нормализация лимита открытых вкладок.
 *
 * Отсутствующее или некорректное значение заменяется значением по умолчанию
 * `50`; значение меньше единицы приводится к единице — открытие хотя бы одной
 * вкладки должно оставаться возможным. Нормализация совпадает с ядром.
 */
export function normalizeOpenTabsLimit(limit: unknown): number {
  const value = Math.trunc(Number(limit));
  if (!Number.isFinite(value)) {
    return DEFAULT_OPEN_TABS_LIMIT;
  }
  return Math.max(1, value);
}

/** Доступность создания новых вкладок по числу открытых и лимиту.
 *
 * `available` — число вкладок меньше лимита; `limit-reached` — равно лимиту;
 * `over-limit` — больше лимита (лимит уменьшен ниже открытого числа вкладок).
 */
export function openAvailability(tabCount: number, limit: number): OpenAvailability {
  const normalized = normalizeOpenTabsLimit(limit);
  if (tabCount > normalized) {
    return 'over-limit';
  }
  return tabCount === normalized ? 'limit-reached' : 'available';
}

/** Счётчик для уникальности идентификаторов в пределах сеанса. */
let sequence = 0;

/** Приведение значения к известному цвету вкладки; неизвестное даёт «не задано». */
export function normalizeTabColor(value: unknown): TabColor | undefined {
  const candidate = String(value ?? '').trim();
  return (TAB_COLORS as readonly string[]).includes(candidate) ? (candidate as TabColor) : undefined;
}

/** Приведение значения к допустимой иконке вкладки; неизвестная даёт «не задано». */
export function normalizeTabIcon(value: unknown): TabIconName | undefined {
  const candidate = String(value ?? '').trim();
  return (TAB_ICON_NAMES as readonly string[]).includes(candidate)
    ? (candidate as TabIconName)
    : undefined;
}

/** Необязательный текст оформления вкладки: пустая строка читается как «не задано». */
function optionalText(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
}

/** Новый идентификатор экземпляра вкладки. */
export function newTabId(): string {
  sequence += 1;
  return `tab-${Date.now().toString(36)}-${sequence}`;
}

/** Пустое рабочее место. */
export function emptyWorkspace(): WorkspaceState {
  return { tabs: [], activeTabId: null };
}

/** Нормализация вкладки из загруженного состояния с безопасным оформлением. */
function normalizeTab(item: unknown): WorkspaceTab {
  const tab = (item ?? {}) as Record<string, unknown>;
  const base: WorkspaceTab = {
    id: String(tab.id ?? newTabId()),
    path: String(tab.path ?? tab.book_id ?? ''),
    title: String(tab.title ?? ''),
    format: String(tab.format ?? ''),
    zoom: Number.isFinite(Number(tab.zoom)) && Number(tab.zoom) > 0 ? Number(tab.zoom) : 100,
    position: Number.isFinite(Number(tab.position)) ? Number(tab.position) : 0,
    mode: String(tab.mode ?? 'scroll'),
  };
  const name = optionalText(tab.name);
  const description = optionalText(tab.description);
  const icon = normalizeTabIcon(tab.icon);
  const color = normalizeTabColor(tab.color);
  if (name !== undefined) {
    base.name = name;
  }
  if (description !== undefined) {
    base.description = description;
  }
  if (icon !== undefined) {
    base.icon = icon;
  }
  if (color !== undefined) {
    base.color = color;
  }
  return base;
}

/** Приведение загруженного состояния к модели с безопасными значениями.
 *
 * Прежние снимки хранили `book_id` вместо пути; такие вкладки читаются как
 * недоступные и предлагают указать файл заново.
 */
export function normalizeWorkspace(value: unknown): WorkspaceState {
  const record = (value ?? {}) as { tabs?: unknown; activeTabId?: unknown; active_tab_id?: unknown };
  const rawTabs = Array.isArray(record.tabs) ? record.tabs : [];
  const tabs: WorkspaceTab[] = rawTabs.map(normalizeTab);
  const requested = record.activeTabId ?? record.active_tab_id;
  const activeTabId =
    typeof requested === 'string' && tabs.some((tab) => tab.id === requested)
      ? requested
      : (tabs[0]?.id ?? null);
  return { tabs, activeTabId };
}

/** Активная вкладка рабочего места. */
export function activeTab(state: WorkspaceState): WorkspaceTab | null {
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
}

/** Открытие книги новой вкладкой и перевод на неё активности.
 *
 * Если задан лимит открытых вкладок и он уже достигнут или превышен, состав
 * вкладок не изменяется: открытие новой вкладки блокируется.
 */
export function openBook(state: WorkspaceState, book: BookRef, limit?: number): WorkspaceState {
  if (limit !== undefined && openAvailability(state.tabs.length, limit) !== 'available') {
    return state;
  }
  const tab: WorkspaceTab = {
    id: newTabId(),
    path: book.path,
    title: book.title,
    format: book.format ?? '',
    zoom: 100,
    position: 0,
    mode: 'scroll',
  };
  return { tabs: [...state.tabs, tab], activeTabId: tab.id };
}

/** Закрытие вкладки; активность переходит соседней. */
export function closeTab(state: WorkspaceState, tabId: string): WorkspaceState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) {
    return state;
  }
  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  if (state.activeTabId !== tabId) {
    return { tabs, activeTabId: state.activeTabId };
  }
  const neighbor = tabs[Math.min(index, tabs.length - 1)] ?? null;
  return { tabs, activeTabId: neighbor?.id ?? null };
}

/** Активация вкладки. */
export function activateTab(state: WorkspaceState, tabId: string): WorkspaceState {
  if (!state.tabs.some((tab) => tab.id === tabId)) {
    return state;
  }
  return { ...state, activeTabId: tabId };
}

/** Дублирование вкладки: независимый экземпляр той же книги.
 *
 * Если задан лимит открытых вкладок и он уже достигнут или превышен,
 * дублирование не создаёт вкладку.
 */
export function duplicateTab(
  state: WorkspaceState,
  tabId: string,
  limit?: number,
): WorkspaceState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) {
    return state;
  }
  if (limit !== undefined && openAvailability(state.tabs.length, limit) !== 'available') {
    return state;
  }
  const copy: WorkspaceTab = { ...state.tabs[index], id: newTabId() };
  const tabs = [...state.tabs];
  tabs.splice(index + 1, 0, copy);
  return { tabs, activeTabId: copy.id };
}

/** Обновление полей вкладки. */
export function updateTab(
  state: WorkspaceState,
  tabId: string,
  patch: Partial<Omit<WorkspaceTab, 'id'>>,
): WorkspaceState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
  };
}

/** Замена книги вкладки с сохранением состояния чтения. */
export function replaceTabBook(
  state: WorkspaceState,
  tabId: string,
  book: BookRef,
): WorkspaceState {
  return updateTab(state, tabId, {
    path: book.path,
    title: book.title,
    format: book.format ?? '',
  });
}

/** Правка пользовательского оформления вкладки.
 *
 * `undefined` в поле означает «снять оформление»: так кнопка сброса очищает все
 * поля сразу. Заданные строки очищаются от внешних пробелов, пустая строка
 * трактуется как «не задано». Неизвестные иконка и цвет отбрасываются.
 */
export function applyTabAppearance(
  state: WorkspaceState,
  tabId: string,
  patch: TabAppearancePatch,
): WorkspaceState {
  const apply = (tab: WorkspaceTab): WorkspaceTab => {
    if (tab.id !== tabId) {
      return tab;
    }
    const next = { ...tab };
    if ('name' in patch) {
      const name = optionalText(patch.name);
      if (name === undefined) {
        delete next.name;
      } else {
        next.name = name;
      }
    }
    if ('description' in patch) {
      const description = optionalText(patch.description);
      if (description === undefined) {
        delete next.description;
      } else {
        next.description = description;
      }
    }
    if ('icon' in patch) {
      const icon = normalizeTabIcon(patch.icon);
      if (icon === undefined) {
        delete next.icon;
      } else {
        next.icon = icon;
      }
    }
    if ('color' in patch) {
      const color = normalizeTabColor(patch.color);
      if (color === undefined) {
        delete next.color;
      } else {
        next.color = color;
      }
    }
    return next;
  };
  return { ...state, tabs: state.tabs.map(apply) };
}

/** Сериализация вкладки к контракту ядра (`snake_case`).
 *
 * Незаданные поля оформления опускаются: отсутствие ключа и есть «не задано»,
 * а прежние читатели без этих ключей получают вкладку без оформления.
 */
export function serializeTab(tab: WorkspaceTab): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id: tab.id,
    path: tab.path,
    title: tab.title,
    format: tab.format,
    zoom: tab.zoom,
    position: tab.position,
    mode: tab.mode,
  };
  if (tab.name !== undefined) {
    record.name = tab.name;
  }
  if (tab.description !== undefined) {
    record.description = tab.description;
  }
  if (tab.icon !== undefined) {
    record.icon = tab.icon;
  }
  if (tab.color !== undefined) {
    record.color = tab.color;
  }
  return record;
}

/** Сериализация состояния вкладок к контракту ядра (`snake_case`). */
export function serializeWorkspace(state: WorkspaceState): Record<string, unknown> {
  return {
    tabs: state.tabs.map(serializeTab),
    active_tab_id: state.activeTabId,
  };
}
