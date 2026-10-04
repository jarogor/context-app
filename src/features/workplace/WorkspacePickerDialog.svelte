<script lang="ts">
  import { AddButton, Dialog, Input } from '@texture/ui';

  /** Рабочее место в диалоге выбора. */
  interface WorkspaceItem {
    /** Идентификатор рабочего места. */
    id: string;
    /** Имя рабочего места. */
    name: string;
  }

  interface Props {
    /** Открытость диалога. */
    open?: boolean;
    /** Рабочие места для выбора. */
    workspaces: WorkspaceItem[];
    /** Выбор рабочего места. */
    onSelect: (id: string) => void;
    /** Создание рабочего места с указанным именем. */
    onCreate: (name: string) => void;
    /** Обработчик изменения открытости (закрытие по Esc или клику вне). */
    onOpenChange?: (open: boolean) => void;
  }

  let { open = $bindable(false), workspaces, onSelect, onCreate, onOpenChange }: Props = $props();

  /** Строка поиска по имени рабочего места. */
  let query = $state('');

  /** Ввод имени нового рабочего места. */
  let newName = $state('');

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
</script>

<Dialog
  bind:open
  title="Открыть в рабочем месте"
  onOpenChange={(value) => {
    if (!value) {
      query = '';
    }
    onOpenChange?.(value);
  }}
>
  <Input bind:value={query} placeholder="Поиск рабочего места" />

  {#if filtered.length === 0}
    <p class="text-sm text-[var(--muted-foreground)]" data-testid="workspace-picker-empty">
      {workspaces.length === 0 ? 'Рабочих мест ещё нет.' : 'Ничего не найдено.'}
    </p>
  {:else}
    <ul
      class="flex max-h-[320px] list-none flex-col gap-1 overflow-y-auto p-0"
      data-testid="workspace-picker-list"
    >
      {#each filtered as item (item.id)}
        <li>
          <button
            type="button"
            data-testid="workspace-picker-item"
            class="w-full cursor-pointer truncate rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left text-sm [font:inherit] hover:bg-[var(--muted)]"
            title={item.name}
            onclick={() => onSelect(item.id)}
          >
            {item.name}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex items-center gap-2 border-t border-[var(--border)] pt-3">
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
</Dialog>
