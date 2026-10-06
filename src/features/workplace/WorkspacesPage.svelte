<script lang="ts">
  import {
    ActionMenu,
    Button,
    Input,
    ListRow,
    MetaList,
    PageShell,
    SearchCreate,
    type MenuAction,
    type MetaItem,
  } from '@texture/ui';
  import { formatDateTime } from '../../shared/format';

  /** Рабочее место в списке. */
  interface WorkspaceItem {
    /** Идентификатор рабочего места. */
    id: string;
    /** Имя рабочего места. */
    name: string;
    /** Время создания (Unix, мс); необязательно. */
    createdAtMillis?: number;
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

  /** Метаинформация рабочего места: дата создания (иконкой) и признак текущего. */
  function metaItems(item: WorkspaceItem): MetaItem[] {
    const items: MetaItem[] = [];
    const created = formatDateTime(item.createdAtMillis ?? 0);
    if (created) {
      items.push({ icon: 'calendar', value: created, title: `Создано ${created}` });
    }
    if (item.id === currentId) {
      items.push({ value: 'текущее', strong: true });
    }
    return items;
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

<PageShell
  testId="workspaces-page"
  empty={workspaces.length === 0}
  emptyTestId="workspaces-empty"
  emptyText="Рабочих мест нет. Создайте рабочее место, чтобы открыть в нём книги."
>
  {#snippet form()}
    <SearchCreate
      bind:query
      createPlaceholder="Новое рабочее место"
      createTitle="Создать рабочее место"
      createAriaLabel="Создать рабочее место"
      {onCreate}
    />
  {/snippet}

  {#snippet toolbar()}
    {#if workspaces.length > 0}
      <Input
        bind:value={query}
        placeholder="Поиск рабочего места"
        ariaLabel="Поиск рабочего места"
        icon="search"
      />
    {/if}
  {/snippet}

  {#if workspaces.length > 0 && filtered.length === 0}
    <p class="text-[var(--muted-foreground)]" data-testid="workspaces-not-found">
      Ничего не найдено.
    </p>
  {:else}
    <ul class="flex list-none flex-col gap-2 p-0">
      {#each filtered as item (item.id)}
        {#if editingId === item.id}
          <li
            class="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2"
            data-testid="workspace-item"
          >
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
          </li>
        {:else}
          <li data-testid="workspace-item">
            <ListRow
              selected={item.id === currentId}
              onclick={() => onOpen(item.id)}
            >
              {#snippet titleContent()}
                <span
                  class="min-w-0 flex-1 truncate text-[0.95rem] font-medium"
                  data-testid="workspace-open"
                  title={item.name}
                >
                  {item.name}
                </span>
              {/snippet}

              {#snippet meta()}
                <span data-testid="workspace-meta">
                  <MetaList items={metaItems(item)} />
                </span>
              {/snippet}

              {#snippet actions()}
                <ActionMenu
                  ariaLabel="Действия с рабочим местом"
                  title="Действия"
                  items={workspaceActions}
                  onselect={(action) => runWorkspaceAction(item, action)}
                />
              {/snippet}
            </ListRow>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</PageShell>
