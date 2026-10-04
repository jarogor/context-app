<script lang="ts">
  import { Button, Input } from '@texture/ui';

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
    /** Идентификатор активного рабочего места. */
    activeId: string | null;
    /** Создание рабочего места с указанным именем. */
    onCreate: (name: string) => void;
    /** Открытие рабочего места. */
    onOpen: (id: string) => void;
    /** Переименование рабочего места. */
    onRename: (id: string, name: string) => void;
    /** Удаление рабочего места. */
    onRemove: (id: string) => void;
  }

  let { workspaces, activeId, onCreate, onOpen, onRename, onRemove }: Props = $props();

  /** Ввод имени нового рабочего места. */
  let newName = $state('');

  /** Идентификатор переименовываемого рабочего места. */
  let editingId: string | null = $state(null);

  /** Черновик имени при переименовании. */
  let editingName = $state('');

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
</script>

<div
  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-6"
  data-testid="workspaces-page"
>
  <div class="mb-4 flex items-end gap-2">
    <label class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="text-xs text-[var(--muted-foreground)]">Имя</span>
      <Input
        bind:value={newName}
        placeholder="Новое рабочее место"
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            create();
          }
        }}
      />
    </label>
    <Button variant="primary" disabled={!newName.trim()} onclick={create}>Создать</Button>
  </div>

  {#if workspaces.length === 0}
    <p class="text-[var(--muted-foreground)]" data-testid="workspaces-empty">
      Рабочих мест нет. Создайте рабочее место, чтобы открыть в нём книги.
    </p>
  {:else}
    <ul class="flex list-none flex-col gap-2 p-0">
      {#each workspaces as item (item.id)}
        <li
          class="flex items-center gap-2 rounded-md border bg-[var(--card)] p-2"
          class:border-[var(--primary)]={item.id === activeId}
          class:border-[var(--input)]={item.id !== activeId}
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
            <Button variant="primary" size="sm" onclick={commitRename}>Сохранить</Button>
            <Button variant="secondary" size="sm" onclick={() => (editingId = null)}>Отмена</Button>
          {:else}
            <button
              type="button"
              data-testid="workspace-open"
              class="min-w-0 flex-1 cursor-pointer truncate rounded-sm px-2 py-[6px] text-left text-[14px] [font:inherit] hover:bg-[var(--background)]"
              title={item.name}
              onclick={() => onOpen(item.id)}
            >
              {item.name}
            </button>
            {#if item.id === activeId}
              <span class="text-xs text-[var(--success)]" data-testid="workspace-active">
                активное
              </span>
            {/if}
            <Button
              variant="secondary"
              size="sm"
              title="Переименовать"
              ariaLabel="Переименовать рабочее место"
              onclick={() => startRename(item.id, item.name)}
            >
              Переименовать
            </Button>
            <Button
              variant="danger"
              size="sm"
              title="Удалить"
              ariaLabel="Удалить рабочее место"
              onclick={() => onRemove(item.id)}
            >
              Удалить
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
