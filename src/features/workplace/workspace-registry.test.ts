import { describe, expect, it } from 'vitest';
import {
  defaultWorkspaceName,
  addWorkspace,
  createWorkspace,
  currentWorkspace,
  emptyRegistry,
  normalizeRegistry,
  removeWorkspace,
  renameWorkspace,
  selectWorkspace,
  serializeRegistry,
  updateCurrentWorkspaceTabs,
  updateWorkspaceTabs,
  rememberSetWorkspace,
  workspacesOfSet,
} from './workspace-registry';
import { openBook, updateTab } from './workplace';

describe('реестр рабочих мест', () => {
  it('создаёт рабочее место, делает его текущим и открывает', () => {
    const registry = createWorkspace(emptyRegistry(), 'Исследование');

    expect(registry.workspaces).toHaveLength(1);
    expect(registry.workspaces[0].name).toBe('Исследование');
    expect(registry.currentWorkspaceId).toBe(registry.workspaces[0].id);
    expect(currentWorkspace(registry)?.name).toBe('Исследование');
  });

  it('заменяет пустое имя именем по умолчанию при создании', () => {
    const registry = createWorkspace(emptyRegistry(), '   ');

    expect(registry.workspaces[0].name).toBe(defaultWorkspaceName());
  });

  it('переключает текущее рабочее место и игнорирует неизвестное', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = addWorkspace(registry, 'Второе', 'ws-2', 2);

    const selected = selectWorkspace(registry, 'ws-1');
    expect(selected.currentWorkspaceId).toBe('ws-1');

    expect(selectWorkspace(registry, 'missing').currentWorkspaceId).toBe('ws-2');
  });

  it('переименовывает рабочее место и отклоняет пустое имя', () => {
    let registry = addWorkspace(emptyRegistry(), 'Старое', 'ws-1', 1);

    registry = renameWorkspace(registry, 'ws-1', '  Новое  ');
    expect(registry.workspaces[0].name).toBe('Новое');

    const unchanged = renameWorkspace(registry, 'ws-1', '   ');
    expect(unchanged.workspaces[0].name).toBe('Новое');
  });

  it('при удалении текущего места не выбирает соседнее автоматически', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = addWorkspace(registry, 'Второе', 'ws-2', 2);

    const removed = removeWorkspace(registry, 'ws-2');

    expect(removed.workspaces).toHaveLength(1);
    expect(removed.currentWorkspaceId).toBeNull();
  });

  it('не оставляет текущего места после удаления последнего', () => {
    let registry = addWorkspace(emptyRegistry(), 'Единственное', 'ws-1', 1);

    registry = removeWorkspace(registry, 'ws-1');

    expect(registry.workspaces).toHaveLength(0);
    expect(registry.currentWorkspaceId).toBeNull();
    expect(currentWorkspace(registry)).toBeNull();
  });

  it('применяет операцию вкладок к выбранному рабочему месту, не задевая другие', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = addWorkspace(registry, 'Второе', 'ws-2', 2);

    registry = updateWorkspaceTabs(registry, 'ws-1', (state) =>
      openBook(state, { path: '/lib/book-1.epub', title: 'Книга' }),
    );

    expect(registry.workspaces[0].tabs).toHaveLength(1);
    expect(registry.workspaces[1].tabs).toHaveLength(0);
  });

  it('без текущего места ничего не создаёт и не меняет', () => {
    const registry = updateCurrentWorkspaceTabs(emptyRegistry(), (state) =>
      openBook(state, { path: '/lib/book-1.epub', title: 'Книга' }),
    );

    expect(registry).toEqual(emptyRegistry());
  });

  it('возвращает вкладки текущего места и сбрасывает текущее при удалении', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = updateWorkspaceTabs(registry, 'ws-1', (state) =>
      openBook(state, { path: '/lib/book-1.epub', title: 'Книга' }),
    );

    expect(currentWorkspace(registry)?.tabs).toHaveLength(1);

    const empty = removeWorkspace(registry, 'ws-1');
    expect(currentWorkspace(empty)).toBeNull();
    expect(empty.workspaces).toHaveLength(0);
  });

  it('нормализует реестр из ядра, но не восстанавливает текущее место', () => {
    const registry = normalizeRegistry({
      workspaces: [
        {
          id: 'ws-1',
          name: 'Первое',
          tabs: [{ id: 't1', path: '/lib/book-1.epub', title: 'Книга' }],
        },
      ],
      active_workspace_id: 'ws-1',
    });

    expect(registry.workspaces).toHaveLength(1);
    expect(registry.workspaces[0].tabs[0].path).toBe('/lib/book-1.epub');
    expect(registry.workspaces[0].tabs[0].zoom).toBe(100);
    expect(registry.currentWorkspaceId).toBeNull();
  });

  it('отбрасывает рабочие места без идентификатора при нормализации', () => {
    const registry = normalizeRegistry({
      workspaces: [{ name: 'Без ид' }, { id: 'ws-2', name: 'Второе' }],
    });

    expect(registry.workspaces).toHaveLength(1);
    expect(registry.workspaces[0].id).toBe('ws-2');
    expect(registry.currentWorkspaceId).toBeNull();
  });

  it('сериализует реестр в контракт ядра (snake_case)', () => {
    let registry = createWorkspace(emptyRegistry(), 'Исследование');
    const workspaceId = registry.currentWorkspaceId as string;
    registry = updateCurrentWorkspaceTabs(registry, (state) =>
      openBook(state, { path: '/lib/book-1.epub', title: 'Книга', format: 'epub' }),
    );

    const serialized = serializeRegistry(registry) as {
      active_workspace_id: string;
      workspaces: Array<Record<string, unknown>>;
    };

    expect(serialized.active_workspace_id).toBe(workspaceId);
    const workspace = serialized.workspaces[0];
    expect(workspace.created_at_millis).toEqual(expect.any(Number));
    const tabs = workspace.tabs as Array<Record<string, unknown>>;
    expect(tabs[0].path).toBe('/lib/book-1.epub');
    expect(tabs[0].activeTabId).toBeUndefined();
    expect(workspace.active_tab_id).toEqual(expect.any(String));
    expect(workspace.activeTabId).toBeUndefined();
  });

  it('сериализованный реестр читается нормализацией без потерь', () => {
    let registry = addWorkspace(emptyRegistry(), 'Исследование', 'ws-1', 42);
    registry = updateWorkspaceTabs(registry, 'ws-1', (state) =>
      openBook(state, { path: '/lib/book-1.epub', title: 'Книга' }),
    );

    const roundtrip = normalizeRegistry(serializeRegistry(registry));

    expect(roundtrip.workspaces[0].createdAtMillis).toBe(42);
    expect(roundtrip.workspaces[0].tabs[0].path).toBe('/lib/book-1.epub');
    // Текущее место при запуске не восстанавливается даже из своего же снимка.
    expect(roundtrip.currentWorkspaceId).toBeNull();
  });

  it('сохраняет оформление вкладки в реестре и при круговом чтении', () => {
    let registry = addWorkspace(emptyRegistry(), 'Исследование', 'ws-1', 42);
    registry = updateWorkspaceTabs(registry, 'ws-1', (state) => {
      const opened = openBook(state, { path: '/lib/book-1.epub', title: 'Книга' });
      return updateTab(opened, opened.activeTabId ?? '', {
        name: 'Черновик',
        description: 'сравнение глав',
        icon: 'star',
        color: 'blue',
      });
    });

    const roundtrip = normalizeRegistry(serializeRegistry(registry));
    const tab = roundtrip.workspaces[0].tabs[0];

    expect(tab.name).toBe('Черновик');
    expect(tab.description).toBe('сравнение глав');
    expect(tab.icon).toBe('star');
    expect(tab.color).toBe('blue');
  });

  it('хранит все места набора, поднимая свежее в начало', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = addWorkspace(registry, 'Второе', 'ws-2', 2);
    registry = rememberSetWorkspace(registry, 'ns-1', 'ws-1');
    registry = rememberSetWorkspace(registry, 'ns-1', 'ws-2');

    expect(workspacesOfSet(registry, 'ns-1')).toEqual(['ws-2', 'ws-1']);

    // Повтор того же места ничего не меняет и не дублирует его.
    const repeated = rememberSetWorkspace(registry, 'ns-1', 'ws-2');
    expect(repeated).toBe(registry);
    expect(workspacesOfSet(repeated, 'ns-1')).toEqual(['ws-2', 'ws-1']);
  });

  it('убирает удалённое место из истории наборов', () => {
    let registry = addWorkspace(emptyRegistry(), 'Первое', 'ws-1', 1);
    registry = addWorkspace(registry, 'Второе', 'ws-2', 2);
    registry = rememberSetWorkspace(registry, 'ns-1', 'ws-2');
    registry = rememberSetWorkspace(registry, 'ns-1', 'ws-1');

    registry = removeWorkspace(registry, 'ws-2');

    expect(workspacesOfSet(registry, 'ns-1')).toEqual(['ws-1']);
  });

  it('нормализует историю наборов и сериализует её', () => {
    const registry = normalizeRegistry({
      workspaces: [{ id: 'ws-1', name: 'Первое' }],
      note_set_workspaces: {
        ' ns-1 ': ['ws-1', ' ws-1 ', '', 'ws-2'],
        'ns-2': [],
      },
    });

    expect(workspacesOfSet(registry, 'ns-1')).toEqual(['ws-1', 'ws-2']);
    expect(workspacesOfSet(registry, 'ns-2')).toEqual([]);

    const serialized = serializeRegistry(registry) as {
      note_set_workspaces: Record<string, string[]>;
    };
    expect(serialized.note_set_workspaces['ns-1']).toEqual(['ws-1', 'ws-2']);
  });
});
