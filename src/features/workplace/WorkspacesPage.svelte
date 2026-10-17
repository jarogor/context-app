<script lang="ts">
  import {
    ActionMenu,
    Badge,
    Button,
    EmptyState,
    Icon,
    Input,
    PageShell,
    type MenuAction,
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

  /** Черновик имени создаваемого места. */
  let newName = $state('');

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

  /** Пути книг рабочего места для превью обложек (не более лимита). */
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

  /** Идентификатор книги в каталоге по абсолютному пути вложения. */
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

  $effect(() => {
    void JSON.stringify(workspaces.map((item) => [item.id, previewPaths(item)]));
    const timer = setTimeout(() => {
      void loadCovers();
    }, 100);
    return () => clearTimeout(timer);
  });

  /** Создание рабочего места из поля ввода. */
  function createFromField() {
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
  class="p-4 md:p-6"
>
  {#snippet emptyContent()}
    <EmptyState
      icon="workspace"
      title="Рабочих мест нет"
      description="Рабочее место — это место исследования: в нём вы откроете книги вкладками и будете вести заметки. Создайте первое в поле «Новое рабочее место» выше."
      testId="workspaces-empty"
    />
  {/snippet}

  {#snippet controls()}
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      {#if workspaces.length > 0}
        <Input
          bind:value={query}
          placeholder="Поиск рабочего места"
          ariaLabel="Поиск рабочего места"
          icon="search"
          class="w-full sm:w-auto sm:max-w-[24rem] sm:flex-1"
        />
        <span class="role-caption text-[var(--muted-foreground)]">
          {filtered.length} из {workspaces.length}
        </span>
      {:else}
        <span class="role-eyebrow text-[var(--muted-foreground)]">Новое рабочее место</span>
      {/if}
    </div>
    <div class="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
      <Input
        bind:value={newName}
        placeholder="Новое рабочее место"
        ariaLabel="Новое рабочее место"
        class="min-w-0 flex-1 sm:w-[15rem] sm:flex-none"
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            createFromField();
          }
        }}
      />
      <Button
        variant="primary"
        title="Создать рабочее место"
        ariaLabel="Создать рабочее место"
        disabled={!newName.trim()}
        onclick={createFromField}
      >
        <Icon name="plus" />
        <span class="hidden sm:inline">Создать</span>
      </Button>
    </div>
  {/snippet}

  {#if workspaces.length > 0 && filtered.length === 0}
    <EmptyState
      icon="search"
      title="Ничего не найдено"
      description="Измените запрос поиска."
      testId="workspaces-not-found"
    />
  {:else}
    <ul
      class="grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]"
      data-testid="workspaces-grid"
    >
      {#each filtered as item (item.id)}
        <li data-testid="workspace-item">
          {#if editingId === item.id}
            <div
              class="flex h-full flex-col gap-2 rounded-[var(--radius)] border border-[var(--primary-border)] bg-[var(--card)] p-4 shadow-raised"
            >
              <span class="role-eyebrow text-[var(--muted-foreground)]">Переименование</span>
              <Input
                bind:value={editingName}
                placeholder="Новое имя"
                ariaLabel="Новое имя рабочего места"
                onkeydown={(event) => {
                  if (event.key === 'Enter') {
                    commitRename();
                  }
                  if (event.key === 'Escape') {
                    editingId = null;
                  }
                }}
              />
              <div class="flex items-center gap-2">
                <Button variant="primary" size="sm" onclick={commitRename}>Сохранить</Button>
                <Button variant="secondary" size="sm" onclick={() => (editingId = null)}>
                  Отмена
                </Button>
              </div>
            </div>
          {:else}
            <article
              class="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] shadow-raised transition-[border-color,box-shadow] focus-within:border-[var(--primary-border)] hover:border-[var(--primary-border)]"
              data-current={item.id === currentId ? 'true' : 'false'}
            >
              <!--
                Обложки открытых книг — обложкой рабочего места: по ней место
                узнаётся быстрее, чем по имени. Пустая полка подсказывает, что
                место ещё не заполнено.
              -->
              <div
                class="flex h-[6.5rem] items-center gap-2 overflow-hidden border-b border-[var(--border)] bg-[var(--muted)] px-3"
              >
                {#if previewPaths(item).length > 0}
                  <span
                    class="flex items-center gap-2"
                    data-testid="workspace-covers"
                  >
                    {#each previewPaths(item) as path (path)}
                      <span
                        class="flex h-[5rem] w-[3.4rem] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--card)] shadow-raised"
                        title={path}
                      >
                        {#if covers[path]}
                          <img class="h-full w-full object-cover" src={covers[path]} alt="" />
                        {:else}
                          <Icon name="book" class="h-4 w-4 text-[var(--muted-foreground)]" />
                        {/if}
                      </span>
                    {/each}
                  </span>
                {:else}
                  <span class="flex flex-col items-center gap-1 text-[var(--muted-foreground)]">
                    <Icon name="workspace" class="h-6 w-6" />
                    <span class="role-caption">Пустая полка</span>
                  </span>
                {/if}
              </div>

              <button
                type="button"
                class="flex min-w-0 flex-1 cursor-pointer flex-col gap-2 p-4 text-left [font:inherit]"
                data-testid="workspace-open"
                title={item.name}
                onclick={() => onOpen(item.id)}
              >
                <span class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate role-heading" data-testid="workspace-name">
                    {item.name}
                  </span>
                  {#if item.id === currentId}
                    <span
                      class="bg-primary text-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      data-testid="workspace-current"
                      title="Текущее рабочее место"
                      aria-label="Текущее рабочее место"
                    >
                      <Icon name="check" class="h-3 w-3" />
                    </span>
                  {/if}
                </span>
                <span
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 role-caption text-[var(--muted-foreground)]"
                  data-testid="workspace-meta"
                >
                  {#if formatDateTime(item.createdAtMillis ?? 0)}
                    <span class="inline-flex items-center gap-1">
                      <Icon name="calendar" class="h-3.5 w-3.5" />
                      {formatDateTime(item.createdAtMillis ?? 0)}
                    </span>
                  {/if}
                  <span class="inline-flex items-center gap-1">
                    <Icon name="book" class="h-3.5 w-3.5" />
                    {bookCountLabel(item.bookCount ?? 0)}
                  </span>
                </span>
              </button>

              <div class="absolute top-2 right-2 flex items-center gap-1">
                {#if item.bookCount}
                  <Badge variant={item.id === currentId ? 'default' : 'muted'}>
                    {item.bookCount}
                  </Badge>
                {/if}
                <ActionMenu
                  ariaLabel="Действия с рабочим местом"
                  title="Действия"
                  class="h-8 w-8"
                  items={workspaceActions}
                  onselect={(action) => runWorkspaceAction(item, action)}
                />
              </div>
            </article>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</PageShell>
