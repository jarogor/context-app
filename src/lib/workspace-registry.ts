/** Реестр рабочих мест: список именованных рабочих мест и активное место.
 *
 * Модуль хранит чистые операции над реестром, независимые от Svelte и IPC.
 * Вкладками управляет `workplace.ts`; реестр адресует их по рабочему месту, чтобы
 * состояние разных мест не смешивалось.
 */

import {
  type BookRef,
  type WorkspaceState,
  type WorkspaceTab,
  emptyWorkspace,
  normalizeWorkspace,
} from './workplace';

/** Рабочее место: имя и собственный набор вкладок. */
export interface WorkspaceRecord {
  /** Идентификатор рабочего места. */
  id: string;
  /** Человекочитаемое имя рабочего места. */
  name: string;
  /** Время создания (Unix, мс). */
  createdAtMillis: number;
  /** Вкладки рабочего места в порядке отображения. */
  tabs: WorkspaceTab[];
  /** Идентификатор активной вкладки. */
  activeTabId: string | null;
}

/** Реестр рабочих мест. */
export interface WorkspaceRegistry {
  /** Рабочие места в порядке отображения. */
  workspaces: WorkspaceRecord[];
  /** Идентификатор активного рабочего места. */
  activeWorkspaceId: string | null;
}

/** Имя рабочего места, создаваемого по умолчанию при открытии книги. */
export const DEFAULT_WORKSPACE_NAME = 'Рабочее место';

/** Счётчик для уникальности идентификаторов в пределах сеанса. */
let sequence = 0;

/** Новый идентификатор рабочего места. */
export function newWorkspaceId(): string {
  sequence += 1;
  return `ws-${Date.now().toString(36)}-${sequence}`;
}

/** Пустой реестр. */
export function emptyRegistry(): WorkspaceRegistry {
  return { workspaces: [], activeWorkspaceId: null };
}

/** Приведение загруженного реестра к модели с безопасными значениями. */
export function normalizeRegistry(value: unknown): WorkspaceRegistry {
  const record = (value ?? {}) as { workspaces?: unknown; active_workspace_id?: unknown };
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
        name: String(entry.name ?? '').trim() || DEFAULT_WORKSPACE_NAME,
        createdAtMillis:
          Number.isFinite(Number(entry.created_at_millis)) &&
          Number(entry.created_at_millis) >= 0
            ? Number(entry.created_at_millis)
            : 0,
        tabs: tabs.tabs,
        activeTabId: tabs.activeTabId,
      } satisfies WorkspaceRecord;
    })
    .filter((item): item is WorkspaceRecord => item !== null);

  const requested = record.active_workspace_id;
  const activeWorkspaceId =
    typeof requested === 'string' && workspaces.some((item) => item.id === requested)
      ? requested
      : (workspaces[0]?.id ?? null);
  return { workspaces, activeWorkspaceId };
}

/** Активное рабочее место. */
export function activeWorkspace(registry: WorkspaceRegistry): WorkspaceRecord | null {
  return registry.workspaces.find((item) => item.id === registry.activeWorkspaceId) ?? null;
}

/** Создание рабочего места и перевод активности на него. */
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
    name: name.trim() || DEFAULT_WORKSPACE_NAME,
    createdAtMillis,
    tabs: [],
    activeTabId: null,
  };
  return {
    workspaces: [...registry.workspaces, workspace],
    activeWorkspaceId: workspace.id,
  };
}

/** Открытие рабочего места: перевод активности и показ его вкладок. */
export function selectWorkspace(registry: WorkspaceRegistry, id: string): WorkspaceRegistry {
  if (!registry.workspaces.some((item) => item.id === id)) {
    return registry;
  }
  return { ...registry, activeWorkspaceId: id };
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
    workspaces: registry.workspaces.map((item) => (item.id === id ? { ...item, name: trimmed } : item)),
  };
}

/** Удаление рабочего места вместе с его вкладками. */
export function removeWorkspace(registry: WorkspaceRegistry, id: string): WorkspaceRegistry {
  const index = registry.workspaces.findIndex((item) => item.id === id);
  if (index < 0) {
    return registry;
  }
  const workspaces = registry.workspaces.filter((item) => item.id !== id);
  if (registry.activeWorkspaceId !== id) {
    return { workspaces, activeWorkspaceId: registry.activeWorkspaceId };
  }
  const neighbor = workspaces[Math.min(index, workspaces.length - 1)] ?? null;
  return { workspaces, activeWorkspaceId: neighbor?.id ?? null };
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
      item.id === id ? { ...item, ...reduce({ tabs: item.tabs, activeTabId: item.activeTabId }) } : item,
    ),
  };
}

/** Применение операции над вкладками к активному рабочему месту.
 *
 * Если активного рабочего места нет, при `createDefault` создаётся рабочее место
 * по умолчанию, и операция применяется к нему.
 */
export function updateActiveWorkspaceTabs(
  registry: WorkspaceRegistry,
  reduce: (state: WorkspaceState) => WorkspaceState,
  createDefault = false,
): WorkspaceRegistry {
  const active = activeWorkspace(registry);
  if (!active) {
    if (!createDefault) {
      return registry;
    }
    const created = addWorkspace(registry, DEFAULT_WORKSPACE_NAME, 'default', Date.now());
    const id = created.activeWorkspaceId;
    return id ? updateWorkspaceTabs(created, id, reduce) : created;
  }
  return updateWorkspaceTabs(registry, active.id, reduce);
}

/** Пустое состояние активного рабочего места (для безопасного чтения вкладок). */
export function activeTabsState(registry: WorkspaceRegistry): WorkspaceState {
  const active = activeWorkspace(registry);
  return active ? { tabs: active.tabs, activeTabId: active.activeTabId } : emptyWorkspace();
}

/** Тип книги для открытия вкладки в активном рабочем месте. */
export type { BookRef };
