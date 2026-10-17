<script lang="ts">
  import {
    Button,
    EmptyState,
    EntityList,
    Icon,
    Input,
    PageShell,
    SearchCreate,
    type MenuAction,
    type MetaItem,
  } from '@texture/ui';
  import { formatDateTime } from '../../shared/format';
  import { activeLibraryPath, loadCover } from '../library/library';

  /** Рабочее место в списке. */
  interface WorkspaceItem {
    /** Идентификатор рабочего места. */
    id: string;
    /** Имя рабочего места. */
    name: string;
    /** Время создания (Unix, мс); необязательно. */
    createdAtMillis?: number;
    /** Число открытых книг (вкладок) рабочего места. */
    bookCount?: number;
    /** Пути книг открытых вкладок — для превью обложек. */
    bookPaths?: string[];
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

  /** Обложки книг по пути (data URI); `null` — обложки нет. */
  let covers = $state<Record<string, string | null>>({});

  /** Корень активной библиотеки для вычисления идентификатора книги. */
  let libraryRoot = $state('');

  /** Число превью обложек в одном рабочем месте. */
  const COVER_PREVIEW_LIMIT = 3;

  /** Рабочие места, отфильтрованные поиском по имени. */
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return workspaces;
    }
    return workspaces.filter((item) => item.name.toLowerCase().includes(needle));
  });

  /** Подпись числа книг рабочего места. */
  function bookCountLabel(count: number): string {
    const noun = count % 10 === 1 && count % 100 !== 11 ? 'книга' : 'книг';
    return `${count} ${noun}`;
  }

  /** Метаинформация рабочего места: дата создания и число книг. */
  function metaItems(item: WorkspaceItem): MetaItem[] {
    const items: MetaItem[] = [];
    const created = formatDateTime(item.createdAtMillis ?? 0);
    if (created) {
      items.push({ icon: 'calendar', value: created, title: `Создано ${created}` });
    }
    items.push({
      icon: 'book',
      value: bookCountLabel(item.bookCount ?? 0),
      title: 'Открытых книг',
    });
    return items;
  }

  /** Пути книг рабочего места для превью обложек (не более лимита).
   *
   * Повторы отбрасываются: одна книга может быть открыта в нескольких вкладках
   * места, а в превью она показывается один раз.
   */
  function previewPaths(item: WorkspaceItem): string[] {
    const unique: string[] = [];
    for (const path of item.bookPaths ?? []) {
      if (path && !unique.includes(path)) {
        unique.push(path);
      }
      if (unique.length >= COVER_PREVIEW_LIMIT) {
        break;
      }
    }
    return unique;
  }

  /** Идентификатор книги в каталоге по абсолютному пути вложения.
   *
   * Идентификатор книги — её путь относительно корня библиотеки; книги вне
   * библиотеки обложки не имеют.
   */
  function bookIdOf(path: string): string | null {
    if (!libraryRoot) {
      return null;
    }
    const root = libraryRoot.replace(/[\\/]+$/, '');
    if (!path.startsWith(root + '/')) {
      return null;
    }
    return path.slice(root.length + 1);
  }

  /** Загрузка обложек открытых книг рабочих мест (best-effort). */
  async function loadCovers() {
    const paths = new Set<string>();
    for (const item of workspaces) {
      for (const path of previewPaths(item)) {
        paths.add(path);
      }
    }
    if (paths.size === 0) {
      return;
    }
    if (!libraryRoot) {
      try {
        libraryRoot = await activeLibraryPath();
      } catch {
        libraryRoot = '';
      }
    }
    const next: Record<string, string | null> = {};
    for (const path of paths) {
      const id = bookIdOf(path);
      if (!id) {
        next[path] = null;
        continue;
      }
      try {
        next[path] = await loadCover(id);
      } catch {
        next[path] = null;
      }
    }
    covers = { ...covers, ...next };
  }

  // Обложки перечитываются при изменении состава рабочих мест: снимок путей
  // берётся отложенно, чтобы не запускать загрузку на каждое изменение.
  $effect(() => {
    void JSON.stringify(workspaces.map((item) => [item.id, previewPaths(item)]));
    const timer = setTimeout(() => {
      void loadCovers();
    }, 100);
    return () => clearTimeout(timer);
  });

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

  /** Обработка действия рабочего места из меню. */
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
>
  {#snippet emptyContent()}
    <EmptyState
      icon="workspace"
      title="Рабочих мест нет"
      description="Создайте рабочее место, чтобы открыть в нём книги."
      testId="workspaces-empty"
    />
  {/snippet}

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

  <EntityList
    items={filtered}
    key={(item) => item.id}
    itemTestId="workspace-item"
    buttonTestId="workspace-open"
    notFound={workspaces.length > 0 && filtered.length === 0}
    notFoundTestId="workspaces-not-found"
    selected={(item) => item.id === currentId}
    onSelect={(item) => onOpen(item.id)}
    metaItems={metaItems}
    metaTestId="workspace-meta"
    actions={() => workspaceActions}
    actionsLabel="Действия с рабочим местом"
    onAction={runWorkspaceAction}
    isEditing={(item) => editingId === item.id}
  >
    {#snippet titleContent(item)}
      <span class="min-w-0 flex-1 truncate role-title" title={item.name}>{item.name}</span>
    {/snippet}

    {#snippet trailing(item)}
      {#if previewPaths(item).length > 0}
        <span class="flex items-center gap-1" data-testid="workspace-covers">
          {#each previewPaths(item) as path (path)}
            <span
              class="flex h-7 w-[1.25rem] items-center justify-center overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--muted)]"
              title={path}
            >
              {#if covers[path]}
                <img class="h-full w-full object-cover" src={covers[path]} alt="" />
              {:else}
                <Icon name="book" class="h-3 w-3 text-[var(--muted-foreground)]" />
              {/if}
            </span>
          {/each}
        </span>
      {/if}
      {#if item.id === currentId}
        <span
          class="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]"
          data-testid="workspace-current"
          title="Текущее рабочее место"
          aria-label="Текущее рабочее место"
        >
          <Icon name="check" class="h-3 w-3" />
        </span>
      {/if}
    {/snippet}

    {#snippet editContent()}
      <div class="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2">
        <label class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="role-caption text-[var(--muted-foreground)]">Новое имя</span>
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
      </div>
    {/snippet}
  </EntityList>
</PageShell>
