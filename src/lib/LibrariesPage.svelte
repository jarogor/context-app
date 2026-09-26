<script lang="ts">
  import { onMount } from 'svelte';
  import { Badge, Button, Spinner, cn } from '@texture/ui';
  import { invokeCommand, openDialog } from './app-bridge';
  import appConfig from './app-config.json';

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

  /** Идёт ли открытие библиотеки. */
  const opening = $derived(openingPath !== null);

  /** Идёт ли открытие пути, которого ещё нет в истории. */
  const openingNew = $derived(
    openingPath !== null && !entries.some((entry) => entry.path === openingPath),
  );

  /** Имя библиотеки по последнему сегменту пути. */
  function libraryName(path: string): string {
    return path.split('/').filter(Boolean).pop() ?? path;
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
      'flex flex-1 cursor-pointer flex-col gap-[3px] rounded-[var(--radius-md)] border bg-[var(--color-surface)] p-[var(--space-2)] text-left [font:inherit] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-muted)]',
      activePath === entry.path
        ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
        : 'border-[var(--color-border-strong)]',
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
    try {
      await invokeCommand('select_source_library', {
        path,
        storageRoot: appConfig.state_dir,
      });
      activePath = path;
    } catch (e) {
      error = String(e);
    } finally {
      openingPath = null;
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
    void loadHistory();
    void loadActive();
  });
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-[var(--space-5)]">
  <div class="mb-[var(--space-4)] flex items-center justify-between gap-[var(--space-4)]">
    <h1 class="text-lg font-semibold">Библиотеки</h1>
    <Button variant="primary" disabled={opening} onclick={pickLibrary}>
      {#if openingNew}
        <Spinner class="h-4 w-4" />
      {/if}
      Открыть библиотеку
    </Button>
  </div>

  {#if error}
    <p class="mb-[var(--space-4)] text-[var(--color-danger)]">{error}</p>
  {/if}

  {#if loading && entries.length === 0}
    <p class="text-[var(--color-text-muted)]">Загрузка…</p>
  {:else if entries.length === 0}
    <p class="text-[var(--color-text-muted)]">
      Нет открытых библиотек. Откройте директорию с книгами.
    </p>
  {:else}
    <ul class="flex list-none flex-col gap-[var(--space-2)] p-0">
      {#each entries as entry (entry.path)}
        <li class="flex items-stretch gap-[var(--space-2)]">
          <button
            class={itemClass(entry)}
            type="button"
            disabled={!entry.available || opening}
            onclick={() => openLibrary(entry.path)}
          >
            <span class="flex items-center gap-[var(--space-2)]">
              <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-live="polite">
                {#if openingPath === entry.path}
                  <Spinner class="h-3 w-3 text-[var(--color-primary)]" />
                {:else if activePath === entry.path}
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    class="text-[var(--color-success)]"
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
                      ? 'var(--color-success)'
                      : 'var(--color-border-strong)'}
                  ></span>
                {/if}
              </span>
              <Badge>{entry.provider_name}</Badge>
              <strong>{libraryName(entry.path)}</strong>
              <span class="text-xs text-[var(--color-text-muted)]">
                {entry.available ? 'доступна' : 'недоступна'}
              </span>
              <span class="ml-auto text-xs text-[var(--color-text-muted)]">
                {formatTime(entry.added_at_millis)}
              </span>
            </span>
            <span class="text-xs text-[var(--color-text-muted)] [overflow-wrap:anywhere]">
              {entry.path}
            </span>
          </button>
          <Button variant="danger" size="sm" onclick={() => forget(entry.path)}>Убрать</Button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
