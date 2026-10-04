<script lang="ts">
  import { ActionMenu, AddButton, Button, Input, type MenuAction } from '@texture/ui';

  /** Рабочее место в списке. */
  interface WorkspaceItem {
    /** Идентификатор рабочего места. */
    id: string;
    /** Имя рабочего места. */
    name: string;
  }

  interface Props {
    /** Рабочие места в порядке отображения. */
    workspaces: WorkspaceItem[];
    /** Идентификатор текущего (открытого) рабочего места. */
    currentId: string | null;
    /** Создание рабочего места с указанным именем. */
    onCreate: (name: string) => void;
    /** Открытие рабочего места. */
    onOpen: (id: string) => void;
    /** Переименование рабочего места. */
    onRename: (id: string, name: string) => void;
    /** Удаление рабочего места. */
    onRemove: (id: string) => void;
  }

  let { workspaces, currentId, onCreate, onOpen, onRename, onRemove }: Props = $props();

  /** Пункты меню действий рабочего места. */
  const workspaceActions: MenuAction[] = [
    { id: 'rename', label: 'Переименовать' },
    { id: 'delete', label: 'Удалить', destructive: true },
  ];

  /** Ввод имени нового рабочего места. */
  let newName = $state('');

  /** Строка поиска по имени рабочего места. */
  let query = $state('');

  /** Идентификатор переименовываемого рабочего места. */
  let editingId: string | null = $state(null);

  /** Черновик имени при переименовании. */
  let editingName = $state('');

  /** Рабочие места, отфильтрованные поиском по имени. */
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return workspaces;
    }
    return workspaces.filter((item) => item.name.toLowerCase().includes(needle));
  });

  /** Создание рабочего места из поля ввода. */
  function create() {
    const name = newName.trim();
    if (!name) {
      return;
    }
    onCreate(name);
    newName = '';
  }

  /** Начало переименования. */
  function startRename(id: string, name: string) {
    editingId = id;
    editingName = name;
  }

  /** Подтверждение переименования. */
  function commitRename() {
    if (editingId === null) {
      return;
    }
    const name = editingName.trim();
    if (name) {
      onRename(editingId, name);
    }
    editingId = null;
    editingName = '';
  }

  /** Выбор действия рабочего места из меню. */
  function runWorkspaceAction(item: WorkspaceItem, action: string) {
    if (action === 'rename') {
      startRename(item.id, item.name);
    }
    if (action === 'delete') {
      onRemove(item.id);
    }
  }
</script>

<div
  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-6"
  data-testid="workspaces-page"
>
  <div class="mb-4 flex items-center gap-2">
    <Input
      bind:value={newName}
      placeholder="Новое рабочее место"
      class="min-w-0 flex-1"
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          create();
        }
      }}
    />
    <AddButton
      title="Создать рабочее место"
      ariaLabel="Создать рабочее место"
      disabled={!newName.trim()}
      onclick={create}
    />
  </div>

  {#if workspaces.length > 0}
    <Input
      bind:value={query}
      placeholder="Поиск рабочего места"
      class="mb-4"
    />
  {/if}

  {#if workspaces.length === 0}
    <p class="text-[var(--muted-foreground)]" data-testid="workspaces-empty">
      Рабочих мест нет. Создайте рабочее место, чтобы открыть в нём книги.
    </p>
  {:else if filtered.length === 0}
    <p class="text-[var(--muted-foreground)]" data-testid="workspaces-not-found">
      Ничего не найдено.
    </p>
  {:else}
    <ul class="flex list-none flex-col gap-2 p-0">
      {#each filtered as item (item.id)}
        <li
          class="flex items-center gap-2 rounded-md border border-[var(--border)] p-2 {item.id ===
          currentId
            ? 'bg-[var(--primary-soft)]'
            : 'bg-[var(--card)] hover:bg-[var(--muted)]'}"
          data-testid="workspace-item"
        >
          {#if editingId === item.id}
            <label class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="text-xs text-[var(--muted-foreground)]">Новое имя</span>
              <Input
                bind:value={editingName}
                placeholder="Новое имя"
                onkeydown={(event) => {
                  if (event.key === 'Enter') {
                    commitRename();
                  }
                  if (event.key === 'Escape') {
                    editingId = null;
                  }
                }}
              />
            </label>
            <Button
              variant="primary"
              size="sm"
              onclick={commitRename}>Сохранить</Button>
            <Button variant="secondary" size="sm" onclick={() => (editingId = null)}>Отмена</Button>
          {:else}
            <button
              type="button"
              data-testid="workspace-open"
              class="min-w-0 flex-1 cursor-pointer truncate px-2 py-[6px] text-left text-[14px] [font:inherit]"
              title={item.name}
              onclick={() => onOpen(item.id)}
            >
              {item.name}
            </button>
            {#if item.id === currentId}
              <span class="text-xs text-[var(--success)]" data-testid="workspace-current">
                текущее
              </span>
            {/if}
            <ActionMenu
              ariaLabel="Действия с рабочим местом"
              title="Действия"
              items={workspaceActions}
              onselect={(action) => runWorkspaceAction(item, action)}
            />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
