<script lang="ts">
  import {
    ActionMenu,
    Badge,
    BookCover,
    Button,
    EmptyState,
    Icon,
    IconButton,
    Input,
    PageShell,
    type MenuAction,
  } from '@context/ui';
  import { t } from '@context/i18n';
  import { onMount } from 'svelte';
  import { NARROW_MAX_WIDTH } from '../../shared/breakpoints';
  import { formatDateTime } from '../../shared/format';
  import { pushDismissLayer } from '../hotkeys/dismiss-layer';
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

  /**
   * Узкое окно (телефон и планшет).
   *
   * На узком экране поле создания занимает всю ширину полосы управления и
   * оттесняет поиск. Поэтому поле показывается только по нажатию кнопки
   * создания, а по умолчанию на его месте стоит сама кнопка.
   */
  let narrow = $state(false);

  /** Открыто ли поле создания на узком окне. */
  let composerOpen = $state(false);

  /** Узел поля создания: к нему ставится фокус при открытии. */
  let composerField = $state<HTMLInputElement | undefined>();

  onMount(() => {
    const query = window.matchMedia(NARROW_MAX_WIDTH);
    narrow = query.matches;
    const onChange = (event: MediaQueryListEvent) => {
      narrow = event.matches;
      // Смена ширины закрывает поле: в широком окне оно и так всегда видно.
      composerOpen = false;
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  /** Показ поля создания на узком окне. */
  function openComposer() {
    composerOpen = true;
  }

  /** Постановка фокуса в поле создания после его появления. */
  $effect(() => {
    if (composerOpen && composerField) {
      composerField.focus();
    }
  });

  /** Скрытие поля создания на узком окне. */
  function closeComposer() {
    composerOpen = false;
    newName = '';
  }

  /** Пункты меню действий рабочего места. */
  const workspaceActions: MenuAction[] = $derived([
    { id: 'rename', label: t('app.workspace.rename') },
    { id: 'delete', label: t('app.workspace.delete'), destructive: true },
  ]);

  /** Строка поиска по имени рабочего места. */
  let query = $state('');

  /** Черновик имени создаваемого места. */
  let newName = $state('');

  /** Идентификатор переименовываемого рабочего места. */
  let editingId: string | null = $state(null);

  /** Черновик имени при переименовании. */
  let editingName = $state('');

  /** Регистрация правки имени слоем закрытия: Escape снимает правку, не трогая
   * раздел. Клавиша приходит от общего диспетчера, поэтому собственного
   * обработчика `Escape` у поля нет. */
  $effect(() => {
    if (editingId === null) {
      return;
    }
    return pushDismissLayer(() => {
      editingId = null;
      editingName = '';
    });
  });

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

  /** Число превью обложек в одном рабочем месте; остальные — счётчиком.
   *
   * Ограничение подобрано под наименьшую ширину карточки (`17rem`): четыре
   * плитки по `3.4rem` с промежутками помещаются целиком. Когда книг больше,
   * один слот занимает счётчик «ещё N», поэтому весь ряд виден и ничего не
   * обрезается.
   */
  const COVER_PREVIEW_LIMIT = 4;

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
    return t('app.workspace.count', { count });
  }

  /** Подпись числа вкладок рабочего места. */
  function tabCountLabel(count: number): string {
    return t('app.workspace.tabsCount', { count });
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

  /** План полки обложек: показанные пути, число скрытых, всего книг.
   *
   * Когда книг больше лимита, один слот занимает счётчик «ещё N», поэтому
   * показанных обложек на одну меньше лимита: весь ряд помещается в карточку и
   * не обрезается.
   */
  function coverPlan(item: WorkspaceItem): { paths: string[]; hidden: number } {
    const all = bookPaths(item);
    const total = all.length > 0 ? all.length : (item.bookCount ?? 0);
    const shown = total > COVER_PREVIEW_LIMIT ? COVER_PREVIEW_LIMIT - 1 : total;
    return { paths: all.slice(0, shown), hidden: total - shown };
  }

  /** Обложки для показа: не больше лимита (счётчик занимает слот). */
  function previewPaths(item: WorkspaceItem): string[] {
    return coverPlan(item).paths;
  }

  /** Сколько книг сверх показанных обложек. */
  function hiddenCount(item: WorkspaceItem): number {
    return coverPlan(item).hidden;
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
      title={t('app.workspace.empty.title')}
      description={t('app.workspace.empty.description')}
      testId="workspaces-empty"
    />
  {/snippet}

  {#snippet controls()}
    <!--
      Одна полоса. Слева — поиск со счётчиком найденного: счётчик относится к
      поиску и стоит сразу за полем, чтобы связь между ними читалась. Справа —
      создание рабочего места: пока поле закрыто, там только кнопка; нажатие
      показывает поле слева от неё, и кнопка не переезжает, а меняет действие
      (пустое поле — закрыть, введённое имя — сохранить).
    -->
    <div class="flex w-full min-w-0 items-center gap-2" data-testid="workspaces-controls">
      {#if !composerOpen && workspaces.length > 0}
        <div class="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <Input
            bind:value={query}
            placeholder={t('app.search.workspace.placeholder')}
            ariaLabel={t('app.search.workspace.placeholder')}
            icon="search"
            clearable
            class="min-w-0 flex-1 sm:w-[24rem] sm:flex-none"
          />
          <span class="flex-none role-caption text-[var(--muted-foreground)]">
            {t('app.search.filter', { shown: filtered.length, total: workspaces.length })}
          </span>
        </div>
      {/if}
      <!--
        Поле имени стоит слева от кнопки: на телефоне и планшете занимает всю
        доступную ширину панели, на широком окне — компактное.
      -->
      <div
        class="ml-auto flex min-w-0 items-center gap-2 {composerOpen ? 'flex-1 sm:flex-none' : 'flex-none'}"
        data-testid="workspace-composer"
      >
        {#if composerOpen}
          <div class="relative min-w-0 flex-1 sm:w-[15rem] sm:flex-none">
            <Input
              bind:element={composerField}
              bind:value={newName}
              placeholder={t('app.search.newWorkspace.placeholder')}
              ariaLabel={t('app.search.newWorkspace.placeholder')}
              clearable
              class="w-full"
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  createFromField();
                }
              }}
            />
          </div>
        {/if}
        {#if composerOpen && newName.trim()}
          <IconButton
            action="add"
            title={t('app.workspace.create')}
            ariaLabel={t('app.workspace.saveCreate')}
            onclick={createFromField}
          />
        {:else if composerOpen}
          <Button
            variant="ghost"
            size="icon"
            title={t('app.workspace.createCancel')}
            ariaLabel={t('app.workspace.createCancel')}
            onclick={closeComposer}
          >
            <Icon name="close" />
          </Button>
        {:else}
          <Button variant="primary" size="sm" onclick={openComposer}>
            <Icon name="plus" />
            {t('app.workspace.create')}
          </Button>
        {/if}
      </div>
    </div>
  {/snippet}

  {#if workspaces.length > 0 && filtered.length === 0}
    <EmptyState
      icon="search"
      title={t('app.search.notFound')}
      description={t('app.search.changeQuery')}
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
              <span class="role-eyebrow text-[var(--muted-foreground)]"
                >{t('app.workspace.renameEyebrow')}</span
              >
              <Input
                bind:value={editingName}
                placeholder={t('app.search.newName.placeholder')}
                ariaLabel={t('app.workspace.newNameLabel')}
                onkeydown={(event) => {
                  if (event.key === 'Enter') {
                    commitRename();
                  }
                }}
              />
              <div class="flex items-center gap-2">
                <Button variant="primary" size="sm" onclick={commitRename}
                  >{t('app.action.save')}</Button
                >
                <Button variant="secondary" size="sm" onclick={() => (editingId = null)}>
                  {t('app.reader.cancel')}
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
                aria-label={t('app.workspace.openNamed', { name: item.name })}
                title={item.name}
                onclick={() => onOpen(item.id)}
              ></button>

              <!--
                Обложки открытых книг — обложкой рабочего места: по ней место
                узнаётся быстрее, чем по имени. Пустая полка подсказывает, что
                место ещё не заполнено. Счётчик скрытых книг — такой же слот в
                ряду (см. `previewPaths`): число превью уменьшается на один,
                поэтому весь ряд помещается в карточку и не обрезается.
              -->
              <div
                class="pointer-events-none flex h-[6.5rem] items-center gap-2 overflow-hidden border-b border-[var(--divider)] bg-[var(--card)] px-3"
              >
                {#if previewPaths(item).length > 0}
                  <span
                    class="flex items-center gap-2"
                    data-testid="workspace-covers"
                  >
                    {#each previewPaths(item) as path (path)}
                      <BookCover
                        src={covers[path]}
                        class="h-[5rem] w-[3.4rem] shrink-0 rounded-sm"
                        testId="workspace-cover"
                      />
                    {/each}
                    {#if hiddenCount(item) > 0}
                      <span
                        class="flex h-[5rem] w-[3.4rem] shrink-0 items-center justify-center rounded-sm border border-[var(--border)] bg-[var(--muted)] role-caption text-[var(--muted-foreground)]"
                        data-testid="workspace-covers-more"
                        title={t('app.workspace.moreBooks', { count: hiddenCount(item) })}
                      >
                        +{hiddenCount(item)}
                      </span>
                    {/if}
                  </span>
                {:else}
                  <span class="flex flex-col items-center gap-1 text-[var(--muted-foreground)]">
                    <Icon name="workspace" class="h-6 w-6" />
                    <span class="role-caption">{t('app.workspace.emptyShelf')}</span>
                  </span>
                {/if}
              </div>

              <div class="pointer-events-none flex min-w-0 flex-1 flex-col gap-2 p-4 text-left">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate role-heading" data-testid="workspace-name">
                    {item.name}
                  </span>
                  {#if item.id === currentId}
                    <Badge testId="workspace-current">{t('app.workspace.current')}</Badge>
                  {/if}
                  <!--
                    Меню действий — в строке названия, как в списках библиотек и
                    наборов заметок: тот же размер кнопки по умолчанию и те же
                    отступы. Прежние собственный размер и абсолютное
                    позиционирование расходились с остальными списками.
                  -->
                  <span class="pointer-events-auto relative z-[2] flex shrink-0 items-center">
                    <ActionMenu
                      ariaLabel={t('app.workspace.actionsLabel')}
                      title={t('app.action.actions')}
                      items={workspaceActions}
                      onselect={(action) => runWorkspaceAction(item, action)}
                    />
                  </span>
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
            </article>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</PageShell>
