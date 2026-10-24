<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Badge, Button, Checkbox, EmptyState, ErrorToast, SidePanel, createAsyncState } from '@context/ui';
  import { formatTime } from '../../shared/format';
  import {
    clearNotifications,
    listNotifications,
    loadTechnicalVisibleDefault,
    markAllNotificationsRead,
    NOTIFICATIONS_SECTION_LOCAL_ID,
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
    /** Закрытие панели (на узком окне панель перекрывает содержимое). */
    onClose?: () => void;
  }

  let { onUnreadChange, initialEntries, initialTechnicalVisible, initialError, onClose }: Props =
    $props();

  /** Записи журнала уведомлений. */
  let entries: NotificationEntry[] = $state(untrack(() => initialEntries ?? []));

  /** Показывать ли технические записи. */
  let technicalVisible = $state(untrack(() => initialTechnicalVisible ?? false));

  /** Ошибка загрузки или операции журнала. */
  const asyncState = createAsyncState();

  // Ошибка, переданная с бутстрапа, показывается сразу при монтировании.
  asyncState.error = untrack(() => initialError ?? '');

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
    const loaded = await asyncState.run(listNotifications);
    if (loaded) {
      entries = loaded;
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
    await asyncState.run(markAllNotificationsRead);
    if (!asyncState.error) {
      entries = entries.map((entry) => ({ ...entry, read: true }));
    }
  }

  /** Полная очистка журнала. */
  async function clearEntries() {
    await asyncState.run(async () => {
      await clearNotifications();
      await load();
    });
  }

  onMount(() => {
    let unlistenAdded: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;
    void (async () => {
      unlistenAdded = await listenEvent('notifications:added', (value) => {
        entries = [...entries, value as NotificationEntry];
      });
      // Панель слушает только свою настройку: событие приходит по каждой
      // сохранённой секции, и загрузка настроек журнала на чужое изменение
      // задерживала отклик интерфейса (панель смонтирована всегда).
      unlistenSettings = await listenEvent('settings:changed', (value) => {
        const section = (value as { section?: unknown } | null)?.section;
        const localId = typeof section === 'string' ? section.split('.').pop() : null;
        if (localId !== NOTIFICATIONS_SECTION_LOCAL_ID) {
          return;
        }
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
</script>

<SidePanel
  title="Уведомления"
  testId="notifications-panel"
  class="w-full"
  {onClose}
>
  {#snippet badge()}
    {#if unreadUser > 0}
      <span
        class="flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-[0.6875rem] px-1.5 role-caption text-[var(--primary-foreground)]"
        style:background="var(--success)"
        aria-label={`Непрочитанных: ${unreadUser}`}
      >
        {unreadUser}
      </span>
    {/if}
  {/snippet}

  {#snippet headerActions()}
    <label class="flex cursor-pointer items-center gap-1 role-caption">
      <Checkbox bind:checked={technicalVisible} />
      Технические
    </label>
    <Button variant="secondary" size="sm" disabled={unreadUser === 0} onclick={markAllRead}>
      Прочитать
    </Button>
    <Button variant="secondary" size="sm" onclick={clearEntries}>Очистить</Button>
  {/snippet}

  {#if visibleEntries.length === 0}
    <div class="p-4">
      <EmptyState icon="bell" title="Нет уведомлений" description="Здесь появятся события приложения." />
    </div>
  {:else}
    <div class="flex-1 overflow-y-auto p-2">
      {#each visibleEntries as entry (entry.id)}
        <article
          class="relative mb-2 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 pl-4"
          class:opacity-65={entry.read}
        >
          <span
            class="absolute inset-y-0 left-0 w-1"
            style:background={accent(entry)}
            aria-hidden="true"
          ></span>
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={entry.level === 'User' ? 'default' : 'outline'}>
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
            <span class="ml-auto role-caption text-[var(--muted-foreground)]">
              {formatTime(entry.timestamp)}
            </span>
          </div>
          <p class="break-words role-body">{entry.message}</p>
        </article>
      {/each}
    </div>
  {/if}
</SidePanel>

<ErrorToast message={asyncState.error} />
