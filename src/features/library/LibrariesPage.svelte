<script lang="ts">
  import { onMount } from 'svelte';
  import { Badge, Button, DeleteButton, Progress, Spinner, cn } from '@texture/ui';
  import { invokeCommand, listenEvent, openDialog } from '../../shared/app-bridge';
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

  /** Идёт ли открытие библиотеки. */
  const opening = $derived(openingPath !== null);

  /** Идёт ли открытие пути, которого ещё нет в истории. */
  const openingNew = $derived(
    openingPath !== null && !entries.some((entry) => entry.path === openingPath),
  );

  /** Имя библиотеки по последнему сегменту пути. */
  function libraryName(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  }

  /** Время открытия в 24-часовом формате. */
  function formatTime(millis: number): string {
    if (!millis) {
      return '';
    }
    return new Date(millis).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  /** Классы карточки записи с учётом активной библиотеки. */
  function itemClass(entry: HistoryEntry): string {
    return cn(
      'flex flex-1 cursor-pointer flex-col gap-[3px] rounded-md border bg-[var(--card)] p-2 text-left [font:inherit] hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--card)] disabled:text-[var(--muted-foreground)]',
      activePath === entry.path
        ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
        : 'border-[var(--input)]',
    );
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

<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-6">
  <div class="mb-4 flex items-center justify-between gap-4">
    <h1 class="text-lg font-semibold">Библиотеки</h1>
    <Button variant="primary" disabled={opening} onclick={pickLibrary}>
      {#if openingNew}
        <Spinner class="h-4 w-4" />
      {/if}
      Открыть библиотеку
    </Button>
  </div>

  {#if error}
    <p class="mb-4 text-[var(--destructive)]">{error}</p>
  {/if}

  {#if opening && progress}
    <div class="mb-4 flex flex-col gap-1">
      <div class="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
        <span>Индексация библиотеки…</span>
        <span>{progress.percent}%</span>
      </div>
      <Progress value={progress.percent} />
    </div>
  {/if}

  {#if loading && entries.length === 0}
    <p class="text-[var(--muted-foreground)]">Загрузка…</p>
  {:else if entries.length === 0}
    <p class="text-[var(--muted-foreground)]">
      Нет открытых библиотек. Откройте директорию с книгами.
    </p>
  {:else}
    <ul class="flex list-none flex-col gap-2 p-0">
      {#each entries as entry (entry.path)}
        <li class="flex items-stretch gap-2">
          <button
            class={itemClass(entry)}
            type="button"
            disabled={!entry.available || opening}
            onclick={() => openLibrary(entry.path)}
          >
            <span class="flex items-center gap-2">
              <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-live="polite">
                {#if openingPath === entry.path}
                  <Spinner class="h-3 w-3 text-[var(--primary)]" />
                {:else if activePath === entry.path}
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    class="text-[var(--success)]"
                    aria-hidden="true"
                  >
                    <path
                      d="M20 6 9 17l-5-5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                {:else}
                  <span
                    class="inline-block h-2 w-2 rounded-full"
                    style:background={entry.available
                      ? 'var(--success)'
                      : 'var(--input)'}
                  ></span>
                {/if}
              </span>
              <Badge>{entry.provider_name}</Badge>
              <strong>{libraryName(entry.path)}</strong>
              <span class="text-xs text-[var(--muted-foreground)]">
                {entry.available ? 'доступна' : 'недоступна'}
              </span>
              <span class="ml-auto text-xs text-[var(--muted-foreground)]">
                {formatTime(entry.added_at_millis)}
              </span>
            </span>
            <span class="text-xs text-[var(--muted-foreground)] [overflow-wrap:anywhere]">
              {entry.path}
            </span>
          </button>
          <DeleteButton
            title="Убрать библиотеку"
            ariaLabel="Убрать библиотеку"
            onclick={() => forget(entry.path)}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>
