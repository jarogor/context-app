<script lang="ts">
  import { t } from '@context/i18n';
  import { onMount, untrack } from 'svelte';
  import {
    Badge,
    Button,
    EmptyState,
    ErrorToast,
    Icon,
    SidePanel,
    createAsyncState,
  } from '@context/ui';
  import { formatTime } from '../../shared/format';
  import {
    clearNotifications,
    listNotifications,
    markAllNotificationsRead,
    type NotificationEntry,
  } from './notifications';
  import { listenEvent } from '../../shared/app-bridge';

  interface Props {
    /** Передача числа непрочитанных пользовательских уведомлений в оболочку. */
    onUnreadChange?: (count: number) => void;
    /** Записи журнала, загруженные на бутстрапе; `undefined` — загрузить самим. */
    initialEntries?: NotificationEntry[];
    /** Ошибка загрузки журнала на бутстрапе. */
    initialError?: string;
    /** Закрытие панели (на узком окне панель перекрывает содержимое). */
    onClose?: () => void;
  }

  let { onUnreadChange, initialEntries, initialError, onClose }: Props = $props();

  /** Записи журнала уведомлений. */
  let entries: NotificationEntry[] = $state(untrack(() => initialEntries ?? []));

  /** Ошибка загрузки или операции журнала. */
  const asyncState = createAsyncState();

  // Ошибка, переданная с бутстрапа, показывается сразу при монтировании.
  asyncState.error = untrack(() => initialError ?? '');

  /**
   * Записи ленты: только пользовательские.
   *
   * Журнал хранит события, адресованные человеку. Техническая диагностика
   * пишется ядром в файл: пользователю она ничего не объясняет, а поддержке
   * нужна целиком, а не по одной строке в ленте.
   */
  let visibleEntries = $derived(entries.filter((entry) => entry.level === 'User'));

  /** Количество непрочитанных пользовательских уведомлений. */
  let unreadUser = $derived(visibleEntries.filter((entry) => !entry.read).length);

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
    void (async () => {
      unlistenAdded = await listenEvent('notifications:added', (value) => {
        entries = [...entries, value as NotificationEntry];
      });
      // Данные уже загружены на бутстрапе; без них (в изоляции) грузим сами.
      if (initialEntries === undefined) {
        await load();
      }
    })();
    return () => {
      unlistenAdded?.();
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
  title={t('app.notifications')}
  testId="notifications-panel"
  class="w-full"
  {onClose}
>
  {#snippet badge()}
    {#if unreadUser > 0}
      <span
        class="flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-[0.6875rem] px-1.5 role-caption text-[var(--counter-foreground)]"
        style:background="var(--counter)"
        aria-label={t('app.notifications.unread', { count: unreadUser })}
      >
        {unreadUser}
      </span>
    {/if}
  {/snippet}

  {#snippet headerActions()}
    <!--
      Действия панели — иконками: подписи занимали всю шапку, и на узком окне
      панель не помещалась. Название действия остаётся доступным именем и
      подсказкой.
    -->
    <Button
      variant="secondary"
      size="icon"
      title={t('app.notifications.markRead')}
      ariaLabel={t('app.notifications.markRead')}
      disabled={unreadUser === 0}
      onclick={markAllRead}
    >
      <Icon name="check" />
    </Button>
    <Button
      variant="secondary"
      size="icon"
      title={t('app.notifications.clear')}
      ariaLabel={t('app.notifications.clear')}
      onclick={clearEntries}
    >
      <Icon name="trash" />
    </Button>
  {/snippet}

  {#if visibleEntries.length === 0}
    <div class="p-4">
      <EmptyState
        icon="bell"
        title={t('app.notifications.empty')}
        description={t('app.notifications.emptyDescription')}
      />
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
