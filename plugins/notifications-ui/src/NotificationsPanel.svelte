<script lang="ts">
  import { Badge, Button, Checkbox } from '@booklib/ui';
  import type { Entry } from './types';

  interface Props {
    entries: Entry[];
    technicalVisible: boolean;
    markAllRead: () => void;
    clear: () => void;
  }

  let { entries, technicalVisible = $bindable(false), markAllRead, clear }: Props = $props();

  /** Отфильтрованные записи: без технического уровня показываем только User. */
  let visibleEntries = $derived(
    technicalVisible ? entries : entries.filter((entry) => entry.level === 'User'),
  );

  /** Количество непрочитанных пользовательских уведомлений. */
  let unreadUser = $derived(entries.filter((entry) => entry.level === 'User' && !entry.read).length);

  /** Цвет акцента записи по уровню и важности. */
  function accent(entry: Entry): string {
    if (entry.level === 'User') {
      return 'var(--color-success)';
    }
    if (entry.severity === 'error') {
      return 'var(--color-danger)';
    }
    if (entry.severity === 'warn') {
      return 'var(--color-warning)';
    }
    return 'var(--color-primary)';
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

<div class="flex h-full flex-col overflow-hidden bg-[var(--color-surface)]">
  <div
    class="flex items-center gap-[var(--space-2)] border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-[var(--space-4)] py-[var(--space-3)]"
  >
    <span class="text-[15px] font-bold text-[var(--color-primary)]">Уведомления</span>
    <span
      class="flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] px-[6px] text-xs font-bold text-[var(--color-primary-fg)]"
      style:background={unreadUser === 0 ? 'var(--color-border-strong)' : 'var(--color-success)'}
    >
      {unreadUser}
    </span>
    <div class="ml-auto flex items-center gap-[var(--space-2)]">
      <label class="flex cursor-pointer items-center gap-[var(--space-1)] text-[13px]">
        <Checkbox bind:checked={technicalVisible} />
        Технические
      </label>
      <Button variant="secondary" size="sm" disabled={unreadUser === 0} onclick={markAllRead}>
        Прочитать
      </Button>
      <Button variant="secondary" size="sm" onclick={clear}>Очистить</Button>
    </div>
  </div>
  <div class="flex-1 overflow-y-auto p-[var(--space-2)]">
    {#if visibleEntries.length === 0}
      <div class="p-[var(--space-5)] text-center text-[var(--color-text-muted)]">
        Нет уведомлений
      </div>
    {:else}
      {#each visibleEntries as entry (entry.id)}
        <div
          class="mb-[var(--space-2)] rounded-[var(--radius-md)] border border-l-[3px] border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-2)]"
          style:border-left-color={accent(entry)}
          class:opacity-60={entry.read}
        >
          <Badge variant={entry.level === 'User' ? 'default' : 'muted'}>
            {entry.level === 'User' ? 'User' : 'Tech'}
          </Badge>
          <Badge
            variant="muted"
            class={entry.severity === 'error'
              ? 'text-[var(--color-danger)]'
              : entry.severity === 'warn'
                ? 'text-[var(--color-warning)]'
                : ''}
          >
            {severityLabels[entry.severity] ?? entry.severity}
          </Badge>
          <span class="break-words">{entry.message}</span>
          <span class="mt-[var(--space-1)] block text-[11px] text-[var(--color-text-muted)]">
            {formatTime(entry.timestamp)}
          </span>
        </div>
      {/each}
    {/if}
  </div>
</div>
