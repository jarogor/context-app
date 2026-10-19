<script lang="ts">
  import {
    ActionMenu,
    Badge,
    Button,
    EmptyState,
    Icon,
    IconButton,
    Input,
    PageShell,
    type MenuAction,
  } from '@texture/ui';
  import { formatDateTime } from '../../shared/format';
  import { cachedCovers, loadCovers, type CoverMap } from '../library/covers';

  /** Рабочее место в списке. */
  interface WorkspaceItem {
    /** Идентификатор рабочего места. */
    id: string;
    /** Имя рабочего места. */
    name: string;
    /** Время создания (Unix, мс); необязательно. */
    createdAtMillis?: number;
    /** Число открытых вкладок рабочего места. */
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

  /** Все пути превью книг рабочих мест. */
  function allPreviewPaths(items: WorkspaceItem[]): string[] {
    const paths: string[] = [];
    for (const item of items) {
      for (const path of previewPaths(item)) {
        if (path && !paths.includes(path)) {
          paths.push(path);
        }
      }
    }
    return paths;
  }

  /** Обложки, догруженные после запуска (сверх кэша бутстрапа). */
  let loadedCovers = $state<CoverMap>({});

  /** Обложки книг по абсолютному пути файла (data URI); `null` — обложки нет.
   *
   * Источник — кэш обложек (`covers.ts`), заполненный на бутстрапе: к первому
   * рендеру обложки уже известны, поэтому `loadedCovers` пуст, а список не
   * пустует. Догруженные обложки сливаются поверх.
   */
  const covers = $derived<CoverMap>({
    ...cachedCovers(allPreviewPaths(workspaces)),
    ...loadedCovers,
  });

  /** Число превью обложек в одном рабочем месте; остальные — счётчиком. */
  const COVER_PREVIEW_LIMIT = 6;

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

  /** Подпись числа вкладок рабочего места. */
  function tabCountLabel(count: number): string {
    const noun = count % 10 === 1 && count % 100 !== 11 ? 'вкладка' : 'вкладок';
    return `${count} ${noun}`;
  }

  /** Число открытых вкладок рабочего места. */
  function tabCount(item: WorkspaceItem): number {
    // Вкладка — один путь; повтор книги во вкладках — разные вкладки.
    return (item.bookPaths ?? []).filter((path) => path).length || (item.bookCount ?? 0);
  }

  /** Число различных книг рабочего места (одна книга в разных вкладках — одна). */
  function bookCount(item: WorkspaceItem): number {
    const paths = bookPaths(item);
    return paths.length > 0 ? paths.length : (item.bookCount ?? 0);
  }

  /** Обложки для показа: не больше лимита, остальные — счётчиком. */
  function previewPaths(item: WorkspaceItem): string[] {
    return bookPaths(item).slice(0, COVER_PREVIEW_LIMIT);
  }

  /** Сколько книг сверх показанных обложек. */
  function hiddenCount(item: WorkspaceItem): number {
    return Math.max(0, bookCount(item) - previewPaths(item).length);
  }

  /** Все различные пути книг рабочего места. */
  function bookPaths(item: WorkspaceItem): string[] {
    const unique: string[] = [];
    for (const path of item.bookPaths ?? []) {
      if (path && !unique.includes(path)) {
        unique.push(path);
      }
    }
    return unique;
  }

  /** Загрузка обложек открытых книг рабочих мест.
   *
   * К моменту первого рендера обложки книг уже посчитаны на бутстрапе и лежат в
   * кэше оболочки, поэтому список рисуется с обложками сразу. Здесь догружаются
   * только пути, которых в кэше ещё нет (например, книга, добавленная после
   * запуска), — одним вызовом ядра. Ошибка не прерывает показ списка.
   */
  async function loadCoversFor(paths: string[]) {
    await loadCovers(paths);
    loadedCovers = { ...loadedCovers, ...cachedCovers(paths) };
  }

  $effect(() => {
    const paths: string[] = [];
    for (const item of workspaces) {
      for (const path of previewPaths(item)) {
        if (!(path in covers) && !paths.includes(path)) {
          paths.push(path);
        }
      }
    }
    if (paths.length === 0) {
      return;
    }
    void loadCoversFor(paths);
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
          clearable
          class="w-full sm:w-auto sm:max-w-[24rem] sm:flex-1"
        />
        <span class="role-caption text-[var(--muted-foreground)]">
          {filtered.length} из {workspaces.length}
        </span>
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
      <IconButton
        action="add"
        title="Создать рабочее место"
        ariaLabel="Создать рабочее место"
        disabled={!newName.trim()}
        onclick={createFromField}
      />
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
              class="flex h-full flex-col gap-2 rounded-[var(--radius)] border border-[var(--primary-border)] bg-[var(--card)] p-4"
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
              class="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] transition-colors hover:bg-[var(--surface-hover)]"
              data-current={item.id === currentId ? 'true' : 'false'}
            >
              <!--
                Весь пункт кликабелен: невидимая кнопка-наложение кроет карточку
                целиком, поэтому открыть место можно и по обложкам, и по тексту.
                Меню действий стоит выше наложения и нажатий места не перехватывает.
              -->
              <button
                type="button"
                class="absolute inset-0 z-[1] cursor-pointer"
                data-testid="workspace-open"
                aria-label={`Открыть «${item.name}»`}
                title={item.name}
                onclick={() => onOpen(item.id)}
              ></button>

              <!--
                Обложки открытых книг — обложкой рабочего места: по ней место
                узнаётся быстрее, чем по имени. Пустая полка подсказывает, что
                место ещё не заполнено.
              -->
              <div
                class="pointer-events-none flex h-[6.5rem] items-center gap-2 overflow-hidden border-b border-[var(--divider)] bg-[var(--muted)] px-3"
              >
                {#if previewPaths(item).length > 0}
                  <span
                    class="flex items-center gap-2"
                    data-testid="workspace-covers"
                  >
                    {#each previewPaths(item) as path (path)}
                      <span
                        class="flex h-[5rem] w-[3.4rem] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--muted)]"
                        title={path}
                      >
                        {#if covers[path]}
                          <img class="h-full w-full object-cover" src={covers[path]} alt="" />
                        {:else}
                          <Icon name="book" class="h-4 w-4 text-[var(--muted-foreground)]" />
                        {/if}
                      </span>
                    {/each}
                    {#if hiddenCount(item) > 0}
                      <span
                        class="flex h-[5rem] w-[3.4rem] shrink-0 items-center justify-center rounded-sm border border-[var(--border)] bg-[var(--card)] role-caption text-[var(--muted-foreground)]"
                        data-testid="workspace-covers-more"
                        title={`Ещё ${bookCountLabel(hiddenCount(item))}`}
                      >
                        +{hiddenCount(item)}
                      </span>
                    {/if}
                  </span>
                {:else}
                  <span class="flex flex-col items-center gap-1 text-[var(--muted-foreground)]">
                    <Icon name="workspace" class="h-6 w-6" />
                    <span class="role-caption">Пустая полка</span>
                  </span>
                {/if}
              </div>

              <div class="pointer-events-none flex min-w-0 flex-1 flex-col gap-2 p-4 text-left">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate role-heading" data-testid="workspace-name">
                    {item.name}
                  </span>
                  {#if item.id === currentId}
                    <Badge testId="workspace-current">Текущее</Badge>
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
                  <span class="inline-flex items-center gap-1" data-testid="workspace-book-count">
                    <Icon name="book" class="h-3.5 w-3.5" />
                    {bookCountLabel(bookCount(item))}
                  </span>
                  <span class="inline-flex items-center gap-1" data-testid="workspace-tab-count">
                    <Icon name="tabs" class="h-3.5 w-3.5" />
                    {tabCountLabel(tabCount(item))}
                  </span>
                </span>
              </div>

              <div class="absolute top-2 right-2 z-[2] flex items-center gap-1">
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
