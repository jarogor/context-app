/** Реестр рабочих мест: список именованных рабочих мест и текущее место.
 *
 * Модуль хранит чистые операции над реестром, независимые от Svelte и IPC.
 * Вкладками управляет `workplace.ts`; реестр адресует их по рабочему месту, чтобы
 * состояние разных мест не смешивалось.
 *
 * Текущее место — это то, чьи вкладки сейчас показаны. Оно становится текущим
 * только явным действием пользователя (открытие, создание, выбор при открытии
 * книги) и не выбирается автоматически при запуске или удалении: сохранённый в
 * файле указатель не восстанавливается, потому что скрытая «активность» путает.
 */

import { t } from '@context/i18n';
import {
  type BookRef,
  type WorkspaceState,
  type WorkspaceTab,
  normalizeWorkspace,
  serializeWorkspace,
} from './workplace';

/** Рабочее место: имя и собственный набор вкладок. */
export interface WorkspaceRecord {
  /** Идентификатор рабочего места. */
  id: string;
  /** Человекочитаемое имя рабочего места. */
  name: string;
  /** Время создания (Unix, мс). */
  createdAtMillis: number;
  /** Время последнего открытия места (Unix, мс); 0 — не открывали. */
  openedAtMillis: number;
  /** Вкладки рабочего места в порядке отображения. */
  tabs: WorkspaceTab[];
  /** Идентификатор активной вкладки. */
  activeTabId: string | null;
}

/** Реестр рабочих мест. */
export interface WorkspaceRegistry {
  /** Рабочие места в порядке отображения. */
  workspaces: WorkspaceRecord[];
  /** Идентификатор текущего (открытого) рабочего места или null. */
  currentWorkspaceId: string | null;
  /** Где открывали наборы заметок: набор → места, свежие первыми. */
  noteSetWorkspaces: Record<string, string[]>;
}

/** Имя рабочего места, создаваемого с пустым именем, на активном языке. */
export function defaultWorkspaceName(): string {
  return t('app.workspace.defaultName');
}

/** Счётчик для уникальности идентификаторов в пределах сеанса. */
let sequence = 0;

/** Новый идентификатор рабочего места. */
export function newWorkspaceId(): string {
  sequence += 1;
  return `ws-${Date.now().toString(36)}-${sequence}`;
}

/** Пустой реестр (используется тестами реестра и оболочки). */
export function emptyRegistry(): WorkspaceRegistry {
  return { workspaces: [], currentWorkspaceId: null, noteSetWorkspaces: {} };
}

/** История наборов: разбор карты «набор → места» с чисткой значений. */
function normalizeNoteSetWorkspaces(value: unknown): Record<string, string[]> {
  const record = (value ?? {}) as Record<string, unknown>;
  const result: Record<string, string[]> = {};
  for (const [rawId, rawPlaces] of Object.entries(record)) {
    const setId = rawId.trim();
    if (!setId || !Array.isArray(rawPlaces)) {
      continue;
    }
    const places: string[] = [];
    for (const item of rawPlaces) {
      const place = String(item ?? '').trim();
      if (place && !places.includes(place)) {
        places.push(place);
      }
    }
    if (places.length > 0) {
      result[setId] = places;
    }
  }
  return result;
}

/** Приведение загруженного реестра к модели с безопасными значениями.
 *
 * Сохранённый указатель `active_workspace_id` намеренно не восстанавливается:
 * после запуска текущего места нет, пока пользователь явно не откроет место.
 * Поле остаётся в контракте файла ради совместимости и записывается при
 * сохранении, но на выбор места при запуске не влияет.
 */
export function normalizeRegistry(value: unknown): WorkspaceRegistry {
  const record = (value ?? {}) as { workspaces?: unknown };
  const rawWorkspaces = Array.isArray(record.workspaces) ? record.workspaces : [];
  const workspaces: WorkspaceRecord[] = rawWorkspaces
    .map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      const id = String(entry.id ?? '').trim();
      if (!id) {
        return null;
      }
      const tabs = normalizeWorkspace({ tabs: entry.tabs, activeTabId: entry.active_tab_id });
      return {
        id,
        name: String(entry.name ?? '').trim() || defaultWorkspaceName(),
        createdAtMillis:
          Number.isFinite(Number(entry.created_at_millis)) && Number(entry.created_at_millis) >= 0
            ? Number(entry.created_at_millis)
            : 0,
        openedAtMillis:
          Number.isFinite(Number(entry.opened_at_millis)) && Number(entry.opened_at_millis) >= 0
            ? Number(entry.opened_at_millis)
            : 0,
        tabs: tabs.tabs,
        activeTabId: tabs.activeTabId,
      } satisfies WorkspaceRecord;
    })
    .filter((item): item is WorkspaceRecord => item !== null);

  return {
    workspaces,
    currentWorkspaceId: null,
    noteSetWorkspaces: normalizeNoteSetWorkspaces(
      (value as { note_set_workspaces?: unknown } | null)?.note_set_workspaces,
    ),
  };
}

/** Текущее (открытое) рабочее место. */
export function currentWorkspace(registry: WorkspaceRegistry): WorkspaceRecord | null {
  return registry.workspaces.find((item) => item.id === registry.currentWorkspaceId) ?? null;
}

/** Создание рабочего места и перевод текущего места на него. */
export function createWorkspace(registry: WorkspaceRegistry, name: string): WorkspaceRegistry {
  return addWorkspace(registry, name, newWorkspaceId(), Date.now());
}

/** Добавление рабочего места с явными идентификатором и временем. */
export function addWorkspace(
  registry: WorkspaceRegistry,
  name: string,
  id: string,
  createdAtMillis: number,
): WorkspaceRegistry {
  const workspace: WorkspaceRecord = {
    id,
    name: name.trim() || defaultWorkspaceName(),
    createdAtMillis,
    openedAtMillis: createdAtMillis,
    tabs: [],
    activeTabId: null,
  };
  return {
    workspaces: [...registry.workspaces, workspace],
    currentWorkspaceId: workspace.id,
    noteSetWorkspaces: registry.noteSetWorkspaces,
  };
}

/** Открытие рабочего места: перевод текущего места и показ его вкладок. */
export function selectWorkspace(registry: WorkspaceRegistry, id: string): WorkspaceRegistry {
  const selected = registry.workspaces.find((item) => item.id === id);
  if (!selected) {
    return registry;
  }
  // Открытие отмечается временем: по нему список показывает последнее
  // открытое место первым, в том числе после перезапуска.
  const openedAtMillis = Date.now();
  return {
    ...registry,
    currentWorkspaceId: id,
    workspaces: [selected, ...registry.workspaces.filter((item) => item.id !== id)].map((item) =>
      item.id === id ? { ...item, openedAtMillis } : item,
    ),
  };
}

/** Переименование рабочего места; пустое имя отклоняется. */
export function renameWorkspace(
  registry: WorkspaceRegistry,
  id: string,
  name: string,
): WorkspaceRegistry {
  const trimmed = name.trim();
  if (!trimmed) {
    return registry;
  }
  return {
    ...registry,
    workspaces: registry.workspaces.map((item) =>
      item.id === id ? { ...item, name: trimmed } : item,
    ),
  };
}

/** Удаление рабочего места вместе с его вкладками.
 *
 * Если удаляется текущее место, текущего места не остаётся: соседнее место не
 * выбирается автоматически — пользователь выбирает его явно.
 */
export function removeWorkspace(registry: WorkspaceRegistry, id: string): WorkspaceRegistry {
  if (!registry.workspaces.some((item) => item.id === id)) {
    return registry;
  }
  const workspaces = registry.workspaces.filter((item) => item.id !== id);
  // Место удалено — убираем его и из истории наборов.
  const noteSetWorkspaces: Record<string, string[]> = {};
  for (const [setId, places] of Object.entries(registry.noteSetWorkspaces)) {
    const rest = places.filter((place) => place !== id);
    if (rest.length > 0) {
      noteSetWorkspaces[setId] = rest;
    }
  }
  if (registry.currentWorkspaceId !== id) {
    return { workspaces, currentWorkspaceId: registry.currentWorkspaceId, noteSetWorkspaces };
  }
  return { workspaces, currentWorkspaceId: null, noteSetWorkspaces };
}

/** Применение операции над вкладками к выбранному рабочему месту. */
export function updateWorkspaceTabs(
  registry: WorkspaceRegistry,
  id: string,
  reduce: (state: WorkspaceState) => WorkspaceState,
): WorkspaceRegistry {
  return {
    ...registry,
    workspaces: registry.workspaces.map((item) =>
      item.id === id
        ? { ...item, ...reduce({ tabs: item.tabs, activeTabId: item.activeTabId }) }
        : item,
    ),
  };
}

/** Применение операции над вкладками к текущему рабочему месту.
 *
 * Если текущего места нет, реестр не меняется: операции с вкладками возможны
 * только внутри открытого места.
 */
export function updateCurrentWorkspaceTabs(
  registry: WorkspaceRegistry,
  reduce: (state: WorkspaceState) => WorkspaceState,
): WorkspaceRegistry {
  const current = currentWorkspace(registry);
  if (!current) {
    return registry;
  }
  return updateWorkspaceTabs(registry, current.id, reduce);
}

/** Где открывали набор: идентификаторы мест, свежие первыми. */
export function workspacesOfSet(registry: WorkspaceRegistry, setId: string): string[] {
  return registry.noteSetWorkspaces[setId] ?? [];
}

/** Запоминание места, в котором открыли набор: место поднимается в начало. */
export function rememberSetWorkspace(
  registry: WorkspaceRegistry,
  setId: string,
  workspaceId: string,
): WorkspaceRegistry {
  const trimmedSet = setId.trim();
  const trimmedWorkspace = workspaceId.trim();
  if (!trimmedSet || !trimmedWorkspace) {
    return registry;
  }
  const places = registry.noteSetWorkspaces[trimmedSet] ?? [];
  if (places[0] === trimmedWorkspace) {
    return registry;
  }
  return {
    ...registry,
    noteSetWorkspaces: {
      ...registry.noteSetWorkspaces,
      [trimmedSet]: [trimmedWorkspace, ...places.filter((place) => place !== trimmedWorkspace)],
    },
  };
}

/** Сериализация реестра к контракту ядра (`snake_case`).
 *
 * Модель оболочки использует camelCase, а ядро ожидает `snake_case`;
 * сериализация на границе IPC не даёт полям теряться при сохранении.
 */
export function serializeRegistry(registry: WorkspaceRegistry): Record<string, unknown> {
  return {
    workspaces: registry.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      created_at_millis: workspace.createdAtMillis,
      opened_at_millis: workspace.openedAtMillis,
      ...serializeWorkspace({ tabs: workspace.tabs, activeTabId: workspace.activeTabId }),
    })),
    active_workspace_id: registry.currentWorkspaceId,
    note_set_workspaces: registry.noteSetWorkspaces,
  };
}

/** Тип книги для открытия вкладки в текущем рабочем месте. */
export type { BookRef };
