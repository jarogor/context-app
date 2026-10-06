<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ActionMenu,
    Badge,
    Button,
    Icon,
    ListRow,
    MetaList,
    PageShell,
    Progress,
    SearchCreate,
    Spinner,
    type MenuAction,
    type MetaItem,
  } from '@texture/ui';
  import { invokeCommand, listenEvent, openDialog } from '../../shared/app-bridge';
  import { formatDateTime } from '../../shared/format';
  import appConfig from './app-config.json';

  interface Props {
    /** Вызывается после успешного открытия библиотеки. */
    onOpened: () => void;
  }

  let { onOpened }: Props = $props();

  /** Запись истории открытых библиотек. */
  interface HistoryEntry {
    /** Путь библиотеки. */
    path: string;
    /** Идентификатор провайдера. */
    provider: string;
    /** Человекочитаемое имя провайдера. */
    provider_name: string;
    /** Время открытия записи (Unix, мс). */
    added_at_millis: number;
    /** Доступна ли библиотека на диске. */
    available: boolean;
  }

  let entries: HistoryEntry[] = $state([]);
  let loading: boolean = $state(false);
  let openingPath: string | null = $state(null);
  let activePath: string | null = $state(null);
  let error: string | null = $state(null);
  /** Прогресс построения индекса открываемой библиотеки (в процентах). */
  let progress: { done: number; total: number; percent: number } | null = $state(null);

  /** Строка поиска по имени библиотеки. */
  let query = $state('');

  /** Идёт ли открытие библиотеки. */
  const opening = $derived(openingPath !== null);

  /** Идёт ли открытие пути, которого ещё нет в истории. */
  const openingNew = $derived(
    openingPath !== null && !entries.some((entry) => entry.path === openingPath),
  );

  /** Записи истории, отфильтрованные поиском по имени библиотеки. */
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return entries;
    }
    return entries.filter((entry) => libraryName(entry.path).toLowerCase().includes(needle));
  });

  /** Имя библиотеки по последнему сегменту пути. */
  function libraryName(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  }

  /** Метаинформация записи истории: время открытия (иконкой) и путь. */
  function metaItems(entry: HistoryEntry): MetaItem[] {
    const items: MetaItem[] = [];
    const opened = formatDateTime(entry.added_at_millis);
    if (opened) {
      items.push({ icon: 'clock', value: opened, title: `Открыта ${opened}` });
    }
    if (entry.path) {
      items.push({ icon: 'folder', value: entry.path, title: entry.path });
    }
    return items;
  }

  /** Пункты меню действий записи истории. */
  function entryActions(entry: HistoryEntry): MenuAction[] {
    return [
      { id: 'open', label: 'Открыть', disabled: !entry.available || opening },
      { id: 'forget', label: 'Убрать из списка', destructive: true },
    ];
  }

  /** Загрузка истории открытых библиотек. */
  async function loadHistory() {
    loading = true;
    try {
      const response = (await invokeCommand('library_history_list', {})) as {
        entries?: HistoryEntry[];
      };
      entries = response.entries ?? [];
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  /** Загрузка сведений об активной библиотеке. */
  async function loadActive() {
    try {
      const response = (await invokeCommand('active_library', {})) as { path?: string } | null;
      activePath = response?.path ?? null;
    } catch {
      // Отсутствие активной библиотеки не является ошибкой страницы.
    }
  }

  /** Открытие библиотеки по пути и обновление истории. */
  async function openLibrary(path: string) {
    if (opening) {
      return;
    }
    openingPath = path;
    error = null;
    progress = null;
    try {
      await invokeCommand('select_source_library', {
        path,
        storageRoot: appConfig.state_dir,
      });
      activePath = path;
      onOpened();
    } catch (e) {
      error = String(e);
    } finally {
      openingPath = null;
      progress = null;
      await loadHistory();
    }
  }

  /** Выбор новой папки библиотеки. */
  async function pickLibrary() {
    if (opening) {
      return;
    }
    error = null;
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        await openLibrary(selected);
      }
    } catch (e) {
      error = String(e);
    }
  }

  /** Удаление записи из истории. */
  async function forget(path: string) {
    try {
      await invokeCommand('library_history_forget', { path });
      await loadHistory();
    } catch (e) {
      error = String(e);
    }
  }

  /** Выбор действия записи истории из меню. */
  function runEntryAction(entry: HistoryEntry, action: string) {
    if (action === 'open') {
      void openLibrary(entry.path);
    }
    if (action === 'forget') {
      void forget(entry.path);
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('library-index-progress', (value) => {
        const payload = value as { done?: number; total?: number; percent?: number };
        if (openingPath !== null && typeof payload?.percent === 'number') {
          progress = {
            done: payload.done ?? 0,
            total: payload.total ?? 0,
            percent: payload.percent,
          };
        }
      });
    })();
    void loadHistory();
    void loadActive();
    return () => unlisten?.();
  });
</script>

<PageShell
  testId="libraries-page"
  loading={loading && entries.length === 0}
  loadingText="Загрузка…"
  empty={entries.length === 0}
  emptyText="Нет открытых библиотек. Откройте директорию с книгами."
>
  {#snippet form()}
    <Button
      variant="primary"
      disabled={opening}
      onclick={pickLibrary}
      class="w-full"
    >
      {#if openingNew}
        <Spinner class="h-4 w-4" />
      {/if}
      Открыть библиотеку
    </Button>
  {/snippet}

  {#snippet toolbar()}
    <SearchCreate bind:query searchPlaceholder="Поиск библиотеки" />

    {#if error}
      <p class="text-[var(--destructive)]">{error}</p>
    {/if}

    {#if opening && progress}
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Индексация библиотеки…</span>
          <span>{progress.percent}%</span>
        </div>
        <Progress value={progress.percent} />
      </div>
    {/if}
  {/snippet}

  {#if entries.length > 0 && filtered.length === 0}
    <p class="text-[var(--muted-foreground)]" data-testid="libraries-not-found">
      Ничего не найдено.
    </p>
  {:else}
    <ul class="flex list-none flex-col gap-2 p-0">
      {#each filtered as entry (entry.path)}
        <li data-testid="library-item">
          <ListRow
            selected={activePath === entry.path}
            disabled={!entry.available || opening}
            onclick={() => void openLibrary(entry.path)}
          >
            {#snippet titleContent()}
              <span
                class="inline-flex h-4 w-4 shrink-0 items-center justify-center"
                aria-live="polite"
                title={entry.available ? 'доступна' : 'недоступна'}
                aria-label={entry.available ? 'доступна' : 'недоступна'}
              >
                {#if openingPath === entry.path}
                  <Spinner class="h-3.5 w-3.5 text-[var(--primary)]" />
                {:else if entry.available}
                  <Icon name="check" class="h-4 w-4 text-[var(--success)]" />
                {:else}
                  <Icon name="close" class="h-4 w-4 text-[var(--muted-foreground)]" />
                {/if}
              </span>
              <strong
                class="min-w-0 flex-1 truncate text-[0.95rem] font-medium"
                data-testid="library-name"
              >
                {libraryName(entry.path)}
              </strong>
            {/snippet}

            {#snippet trailing()}
              <Badge>{entry.provider_name}</Badge>
            {/snippet}

            {#snippet meta()}
              <span
                class="flex flex-wrap items-center gap-x-3 gap-y-1"
                data-testid="library-meta"
              >
                <MetaList items={metaItems(entry)} />
              </span>
            {/snippet}

            {#snippet actions()}
              <ActionMenu
                ariaLabel="Действия с библиотекой"
                title="Действия"
                items={entryActions(entry)}
                onselect={(action) => runEntryAction(entry, action)}
              />
            {/snippet}
          </ListRow>
        </li>
      {/each}
    </ul>
  {/if}
</PageShell>
