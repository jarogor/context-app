<script lang="ts">
  import { Dialog, Icon, SearchCreate } from '@context/ui';

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

  /** Рабочие места, отфильтрованные поиском по имени. */
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return workspaces;
    }
    return workspaces.filter((item) => item.name.toLowerCase().includes(needle));
  });
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
  <p class="role-body text-[var(--muted-foreground)]">
    Выберите место, в которое добавится книга, или создайте новое.
  </p>
  <SearchCreate
    bind:query
    createPlaceholder="Новое рабочее место"
    createTitle="Создать рабочее место"
    createAriaLabel="Создать рабочее место"
    searchPlaceholder="Поиск рабочего места"
    {onCreate}
  />

  {#if filtered.length === 0}
    <p class="role-body text-[var(--muted-foreground)]" data-testid="workspace-picker-empty">
      {workspaces.length === 0 ? 'Рабочих мест ещё нет.' : 'Ничего не найдено.'}
    </p>
  {:else}
    <ul
      class="flex max-h-[20rem] list-none flex-col gap-1.5 overflow-y-auto p-0"
      data-testid="workspace-picker-list"
    >
      {#each filtered as item (item.id)}
        <li>
          <button
            type="button"
            data-testid="workspace-picker-item"
            class="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left role-body transition-colors [font:inherit] hover:border-[var(--primary-border)] hover:bg-[var(--primary-soft)]"
            title={item.name}
            onclick={() => onSelect(item.id)}
          >
            <Icon name="workspace" class="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
            <span class="min-w-0 flex-1 truncate">{item.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Dialog>
