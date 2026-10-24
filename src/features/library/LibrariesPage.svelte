<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Badge,
    Button,
    EntityList,
    Icon,
    Input,
    PageShell,
    Progress,
    Spinner,
    type MenuAction,
    type MetaItem,
  } from '@context/ui';
  import { invokeCommand, listenEvent, openDialog } from '../../shared/app-bridge';
  import { formatDateTime } from '../../shared/format';
  import { lastSegment } from '../../shared/path';
  import { activeLibrary } from '../../shared/base-plugin';
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
    providerName: string;
    /** Время открытия записи (Unix, мс). */
    addedAtMillis: number;
    /** Доступна ли библиотека на диске. */
    available: boolean;
  }

  /** Нормализация записи истории из ответа команды (snake_case → camelCase). */
  function normalizeHistoryEntry(value: unknown): HistoryEntry {
    const record = (value ?? {}) as Record<string, unknown>;
    return {
      path: String(record.path ?? ''),
      provider: String(record.provider ?? ''),
      providerName: String(record.provider_name ?? ''),
      addedAtMillis: Number(record.added_at_millis ?? 0),
      available: Boolean(record.available),
    };
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
    return lastSegment(path);
  }

  /** Метаинформация записи истории: время открытия (иконкой) и путь. */
  function metaItems(entry: HistoryEntry): MetaItem[] {
    const items: MetaItem[] = [];
    const opened = formatDateTime(entry.addedAtMillis);
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
        entries?: unknown[];
      };
      entries = (response.entries ?? []).map(normalizeHistoryEntry);
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
      const response = await activeLibrary();
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
      // Уже открытая библиотека не переоткрывается: ядро вернёт её без опроса
      // source-плагинов и переиндексации (см. `select_source_library`).
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
      void loadHistory();
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
  emptyIcon="library"
  emptyTitle="Нет открытых библиотек"
  emptyText="Откройте директорию с книгами — она появится в списке, и по ней построится каталог."
>
  {#snippet emptyAction()}
    <Button variant="primary" disabled={opening} onclick={pickLibrary}>
      {#if openingNew}
        <Spinner class="h-4 w-4" />
      {/if}
      <Icon name="folder" />
      Открыть библиотеку
    </Button>
  {/snippet}

  {#snippet controls()}
    <Input
      bind:value={query}
      placeholder="Поиск библиотеки"
      ariaLabel="Поиск библиотеки"
      icon="search"
      clearable
      class="w-full sm:w-auto sm:max-w-[24rem] sm:flex-1"
    />
    <div class="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
      <Button variant="primary" disabled={opening} onclick={pickLibrary}>
        {#if openingNew}
          <Spinner class="h-4 w-4" />
        {/if}
        <Icon name="folder" />
        Открыть библиотеку
      </Button>
    </div>
  {/snippet}

  {#if error}
    <p class="role-body text-[var(--destructive)]" data-testid="libraries-error">{error}</p>
  {/if}

  {#if opening && progress}
    <div class="flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
      <div class="flex items-center justify-between role-caption text-[var(--muted-foreground)]">
        <span>Индексация библиотеки…</span>
        <span>{progress.percent}%</span>
      </div>
      <Progress value={progress.percent} />
    </div>
  {/if}

  <EntityList
    items={filtered}
    key={(entry) => entry.path}
    itemTestId="library-item"
    notFound={entries.length > 0 && filtered.length === 0}
    notFoundTestId="libraries-not-found"
    disabled={(entry) => !entry.available || opening}
    onSelect={(entry) => void openLibrary(entry.path)}
    metaItems={metaItems}
    metaTestId="library-meta"
    actions={entryActions}
    actionsLabel="Действия с библиотекой"
    onAction={runEntryAction}
  >
    {#snippet titleContent(entry)}
      <span
        class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)]"
        aria-live="polite"
        title={entry.available ? 'доступна' : 'недоступна'}
        aria-label={entry.available ? 'доступна' : 'недоступна'}
      >
        {#if openingPath === entry.path}
          <Spinner class="h-3.5 w-3.5 text-[var(--primary)]" />
        {:else if entry.available}
          <Icon name="check" class="h-3.5 w-3.5 text-[var(--success)]" />
        {:else}
          <Icon name="close" class="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        {/if}
      </span>
      <strong class="min-w-0 flex-1 truncate role-title" data-testid="library-name">
        {libraryName(entry.path)}
      </strong>
      {#if activePath === entry.path}
        <Badge variant="default">Текущая</Badge>
      {/if}
    {/snippet}

    {#snippet trailing(entry)}
      <Badge variant="outline">{entry.providerName}</Badge>
    {/snippet}
  </EntityList>
</PageShell>
