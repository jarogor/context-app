/** Состояние рабочего места: вкладки и активная вкладка.
 *
 * Модуль хранит чистые операции над вкладками, независимые от Svelte и IPC.
 * Вкладка — экземпляр открытия книги: дубликат книги получает собственный
 * идентификатор и собственное состояние чтения. Вложением вкладки служит путь к
 * файлу книги: рабочее место не знает, откуда книга — из библиотеки или выбрана
 * с диска.
 */

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
}

/** Состояние рабочего места. */
export interface WorkspaceState {
  /** Вкладки в порядке отображения. */
  tabs: WorkspaceTab[];
  /** Идентификатор активной вкладки. */
  activeTabId: string | null;
}

/** Счётчик для уникальности идентификаторов в пределах сеанса. */
let sequence = 0;

/** Новый идентификатор экземпляра вкладки. */
export function newTabId(): string {
  sequence += 1;
  return `tab-${Date.now().toString(36)}-${sequence}`;
}

/** Пустое рабочее место. */
export function emptyWorkspace(): WorkspaceState {
  return { tabs: [], activeTabId: null };
}

/** Приведение загруженного состояния к модели с безопасными значениями.
 *
 * Прежние снимки хранили `book_id` вместо пути; такие вкладки читаются как
 * недоступные и предлагают указать файл заново.
 */
export function normalizeWorkspace(value: unknown): WorkspaceState {
  const record = (value ?? {}) as { tabs?: unknown; activeTabId?: unknown; active_tab_id?: unknown };
  const rawTabs = Array.isArray(record.tabs) ? record.tabs : [];
  const tabs: WorkspaceTab[] = rawTabs.map((item) => {
    const tab = (item ?? {}) as Record<string, unknown>;
    return {
      id: String(tab.id ?? newTabId()),
      path: String(tab.path ?? tab.book_id ?? ''),
      title: String(tab.title ?? ''),
      format: String(tab.format ?? ''),
      zoom: Number.isFinite(Number(tab.zoom)) && Number(tab.zoom) > 0 ? Number(tab.zoom) : 100,
      position: Number.isFinite(Number(tab.position)) ? Number(tab.position) : 0,
      mode: String(tab.mode ?? 'scroll'),
    };
  });
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

/** Открытие книги новой вкладкой и перевод на неё активности. */
export function openBook(state: WorkspaceState, book: BookRef): WorkspaceState {
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

/** Дублирование вкладки: независимый экземпляр той же книги. */
export function duplicateTab(state: WorkspaceState, tabId: string): WorkspaceState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) {
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

/** Сериализация вкладки к контракту ядра (`snake_case`). */
export function serializeTab(tab: WorkspaceTab): Record<string, unknown> {
  return {
    id: tab.id,
    path: tab.path,
    title: tab.title,
    format: tab.format,
    zoom: tab.zoom,
    position: tab.position,
    mode: tab.mode,
  };
}

/** Сериализация состояния вкладок к контракту ядра (`snake_case`). */
export function serializeWorkspace(state: WorkspaceState): Record<string, unknown> {
  return {
    tabs: state.tabs.map(serializeTab),
    active_tab_id: state.activeTabId,
  };
}
