<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Badge, Button, Checkbox } from '@texture/ui';
  import {
    clearNotifications,
    listNotifications,
    loadTechnicalVisibleDefault,
    markAllNotificationsRead,
    type NotificationEntry,
  } from './notifications';
  import { listenEvent } from '../../shared/app-bridge';

  interface Props {
    /** Передача числа непрочитанных пользовательских уведомлений в оболочку. */
    onUnreadChange?: (count: number) => void;
    /** Записи журнала, загруженные на бутстрапе; `undefined` — загрузить самим. */
    initialEntries?: NotificationEntry[];
    /** Начальное значение показа технических записей с бутстрапа. */
    initialTechnicalVisible?: boolean;
    /** Ошибка загрузки журнала на бутстрапе. */
    initialError?: string;
  }

  let { onUnreadChange, initialEntries, initialTechnicalVisible, initialError }: Props = $props();

  /** Записи журнала уведомлений. */
  let entries: NotificationEntry[] = $state(untrack(() => initialEntries ?? []));

  /** Показывать ли технические записи. */
  let technicalVisible = $state(untrack(() => initialTechnicalVisible ?? false));

  /** Ошибка загрузки или операции журнала. */
  let errorMessage = $state(untrack(() => initialError ?? ''));

  /** Отфильтрованные записи: без технического уровня показываем только User. */
  let visibleEntries = $derived(
    technicalVisible ? entries : entries.filter((entry) => entry.level === 'User'),
  );

  /** Количество непрочитанных пользовательских уведомлений. */
  let unreadUser = $derived(entries.filter((entry) => entry.level === 'User' && !entry.read).length);

  /** Передача счётчика в оболочку для кнопки в верхней панели. */
  $effect(() => {
    onUnreadChange?.(unreadUser);
  });

  /** Загрузка журнала уведомлений. */
  async function load() {
    try {
      entries = await listNotifications();
      errorMessage = '';
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Загрузка начального технического уровня из настроек. */
  async function loadSettings() {
    try {
      const value = await loadTechnicalVisibleDefault();
      if (value !== null) {
        technicalVisible = value;
      }
    } catch {
      // Отсутствие секции настроек не мешает панели уведомлений.
    }
  }

  /** Пометка всех записей прочитанными. */
  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      entries = entries.map((entry) => ({ ...entry, read: true }));
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Полная очистка журнала. */
  async function clearEntries() {
    try {
      await clearNotifications();
      await load();
    } catch (error) {
      errorMessage = String(error);
    }
  }

  onMount(() => {
    let unlistenAdded: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;
    void (async () => {
      unlistenAdded = await listenEvent('notifications:added', (value) => {
        entries = [...entries, value as NotificationEntry];
      });
      unlistenSettings = await listenEvent('settings:changed', () => {
        void loadSettings();
      });
      // Данные уже загружены на бутстрапе; без них (в изоляции) грузим сами.
      if (initialEntries === undefined) {
        await loadSettings();
        await load();
      }
    })();
    return () => {
      unlistenAdded?.();
      unlistenSettings?.();
    };
  });

  /** Цвет акцента записи по уровню и важности. */
  function accent(entry: NotificationEntry): string {
    if (entry.level === 'User') {
      return 'var(--success)';
    }
    if (entry.severity === 'error') {
      return 'var(--destructive)';
    }
    if (entry.severity === 'warn') {
      return 'var(--warning)';
    }
    return 'var(--primary)';
  }

  /** Человекочитаемая подпись степени серьёзности. */
  const severityLabels: Record<string, string> = {
    error: 'ERROR',
    warn: 'WARN',
    info: 'INFO',
    debug: 'DEBUG',
    trace: 'TRACE',
  };

  /** Время записи в 24-часовом формате. */
  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
</script>

<div class="flex h-full flex-col overflow-hidden bg-[var(--card)]">
  <div
    class="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)] px-4 py-3"
  >
    <span class="text-[15px] font-bold text-[var(--primary)]">Уведомления</span>
    <span
      class="flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] px-[6px] text-xs font-bold text-[var(--primary-foreground)]"
      style:background={unreadUser === 0 ? 'var(--input)' : 'var(--success)'}
    >
      {unreadUser}
    </span>
    <div class="ml-auto flex items-center gap-2">
      <label class="flex cursor-pointer items-center gap-1 text-[13px]">
        <Checkbox bind:checked={technicalVisible} />
        Технические
      </label>
      <Button variant="secondary" size="sm" disabled={unreadUser === 0} onclick={markAllRead}>
        Прочитать
      </Button>
      <Button variant="secondary" size="sm" onclick={clearEntries}>Очистить</Button>
    </div>
  </div>
  <div class="flex-1 overflow-y-auto p-2">
    {#if visibleEntries.length === 0}
      <div class="p-6 text-center text-[var(--muted-foreground)]">
        Нет уведомлений
      </div>
    {:else}
      {#each visibleEntries as entry (entry.id)}
        <div
          class="mb-2 rounded-md border border-l-[3px] border-[var(--border)] bg-[var(--card)] p-2"
          style:border-left-color={accent(entry)}
          class:opacity-60={entry.read}
        >
          <Badge variant={entry.level === 'User' ? 'default' : 'muted'}>
            {entry.level === 'User' ? 'User' : 'Tech'}
          </Badge>
          <Badge
            variant="muted"
            class={entry.severity === 'error'
              ? 'text-[var(--destructive)]'
              : entry.severity === 'warn'
                ? 'text-[var(--warning)]'
                : ''}
          >
            {severityLabels[entry.severity] ?? entry.severity}
          </Badge>
          <span class="break-words">{entry.message}</span>
          <span class="mt-1 block text-[11px] text-[var(--muted-foreground)]">
            {formatTime(entry.timestamp)}
          </span>
        </div>
      {/each}
    {/if}
  </div>
</div>

{#if errorMessage}
  <div
    class="fixed right-[8px] bottom-[8px] left-[8px] z-10 rounded-md bg-[var(--destructive-soft)] p-2 text-xs text-[var(--destructive)]"
    role="alert"
  >
    {errorMessage}
  </div>
{/if}
