import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_NAME,
  activeTabsState,
  activeWorkspace,
  addWorkspace,
  createWorkspace,
  emptyRegistry,
  normalizeRegistry,
  removeWorkspace,
  renameWorkspace,
  selectWorkspace,
  updateActiveWorkspaceTabs,
  updateWorkspaceTabs,
} from './workspace-registry';
import { openBook } from './workplace';

describe('реестр рабочих мест', () => {
  it('создаёт рабочее место, делает его активным и открывает', () => {
    const registry = createWorkspace(emptyRegistry(), 'Исследование');

    expect(registry.workspaces).toHaveLength(1);
    expect(registry.workspaces[0].name).toBe('Исследование');
    expect(registry.activeWorkspaceId).toBe(registry.workspaces[0].id);
    expect(activeWorkspace(registry)?.name).toBe('Исследование');
  });

  it('заменяет пустое имя именем по умолчанию при создании', () => {
    const registry = createWorkspace(emptyRegistry(), '   ');

    expect(registry.workspaces[0].name).toBe(DEFAULT_WORKSPACE_NAME);
  });

  it('переключает активное рабочее место и игнорирует неизвестное', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = addWorkspace(registry, 'Второе', 'ws-2', 2);

    const selected = selectWorkspace(registry, 'ws-1');
    expect(selected.activeWorkspaceId).toBe('ws-1');

    expect(selectWorkspace(registry, 'missing').activeWorkspaceId).toBe('ws-2');
  });

  it('переименовывает рабочее место и отклоняет пустое имя', () => {
    let registry = addWorkspace(emptyRegistry(), 'Старое', 'ws-1', 1);

    registry = renameWorkspace(registry, 'ws-1', '  Новое  ');
    expect(registry.workspaces[0].name).toBe('Новое');

    const unchanged = renameWorkspace(registry, 'ws-1', '   ');
    expect(unchanged.workspaces[0].name).toBe('Новое');
  });

  it('удаляет рабочее место и переводит активность соседнему', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = addWorkspace(registry, 'Второе', 'ws-2', 2);

    const removed = removeWorkspace(registry, 'ws-2');

    expect(removed.workspaces).toHaveLength(1);
    expect(removed.activeWorkspaceId).toBe('ws-1');
  });

  it('не оставляет активного места после удаления последнего', () => {
    let registry = addWorkspace(emptyRegistry(), 'Единственное', 'ws-1', 1);

    registry = removeWorkspace(registry, 'ws-1');

    expect(registry.workspaces).toHaveLength(0);
    expect(registry.activeWorkspaceId).toBeNull();
    expect(activeWorkspace(registry)).toBeNull();
  });

  it('применяет операцию вкладок к выбранному рабочему месту, не задевая другие', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = addWorkspace(registry, 'Второе', 'ws-2', 2);

    registry = updateWorkspaceTabs(registry, 'ws-1', (state) =>
      openBook(state, { bookId: 'book-1', title: 'Книга' }),
    );

    expect(registry.workspaces[0].tabs).toHaveLength(1);
    expect(registry.workspaces[1].tabs).toHaveLength(0);
  });

  it('без активного места создаёт рабочее место по умолчанию при открытии книги', () => {
    const registry = updateActiveWorkspaceTabs(
      emptyRegistry(),
      (state) => openBook(state, { bookId: 'book-1', title: 'Книга' }),
      true,
    );

    expect(registry.workspaces).toHaveLength(1);
    expect(registry.workspaces[0].id).toBe('default');
    expect(registry.workspaces[0].tabs).toHaveLength(1);
    expect(registry.activeWorkspaceId).toBe('default');
  });

  it('без активного места и без создания ничего не меняет', () => {
    const registry = updateActiveWorkspaceTabs(emptyRegistry(), (state) =>
      openBook(state, { bookId: 'book-1', title: 'Книга' }),
    );

    expect(registry).toEqual(emptyRegistry());
  });

  it('возвращает вкладки активного места и пустое состояние без активного', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = updateWorkspaceTabs(registry, 'ws-1', (state) =>
      openBook(state, { bookId: 'book-1', title: 'Книга' }),
    );

    expect(activeTabsState(registry).tabs).toHaveLength(1);

    const empty = removeWorkspace(registry, 'ws-1');
    expect(activeTabsState(empty).tabs).toHaveLength(0);
    expect(activeTabsState(empty).activeTabId).toBeNull();
  });

  it('нормализует реестр из ядра и чинит активное место', () => {
    const registry = normalizeRegistry({
      workspaces: [
        { id: 'ws-1', name: 'Первое', tabs: [{ id: 't1', book_id: 'book-1', title: 'Книга' }] },
      ],
      active_workspace_id: 'missing',
    });

    expect(registry.workspaces).toHaveLength(1);
    expect(registry.workspaces[0].tabs[0].bookId).toBe('book-1');
    expect(registry.workspaces[0].tabs[0].zoom).toBe(100);
    expect(registry.activeWorkspaceId).toBe('ws-1');
  });

  it('отбрасывает рабочие места без идентификатора при нормализации', () => {
    const registry = normalizeRegistry({
      workspaces: [{ name: 'Без ид' }, { id: 'ws-2', name: 'Второе' }],
    });

    expect(registry.workspaces).toHaveLength(1);
    expect(registry.workspaces[0].id).toBe('ws-2');
    expect(registry.activeWorkspaceId).toBe('ws-2');
  });
});
