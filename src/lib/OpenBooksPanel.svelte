<script lang="ts">
  import type { WorkspaceTab } from './workplace';

  interface Props {
    /** Вкладки рабочего места. */
    tabs: WorkspaceTab[];
    /** Активная вкладка. */
    activeTabId: string | null;
    /** Выбор книги. */
    onSelect: (id: string) => void;
    /** Закрытие вкладки. */
    onClose: (id: string) => void;
  }

  let { tabs, activeTabId, onSelect, onClose }: Props = $props();
</script>

<aside
  class="flex w-[260px] flex-none flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]"
  data-testid="open-books-panel"
>
  <div
    class="flex flex-[0_0_42px] items-center border-b border-[var(--color-border)] px-[var(--space-3)] text-[13px] font-semibold"
  >
    Открытые книги
  </div>
  <ul class="m-0 flex list-none flex-col gap-[2px] p-[var(--space-2)]">
    {#each tabs as tab (tab.id)}
      <li class="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          class="min-w-0 flex-1 cursor-pointer truncate rounded-[var(--radius-sm)] px-[var(--space-2)] py-[6px] text-left text-[13px] [font:inherit] hover:bg-[var(--color-bg)]"
          class:bg-[var(--color-bg)]={tab.id === activeTabId}
          aria-pressed={tab.id === activeTabId}
          title={tab.title}
          onclick={() => onSelect(tab.id)}
        >
          {tab.title}
        </button>
        <button
          type="button"
          title="Закрыть вкладку"
          aria-label="Закрыть вкладку"
          class="cursor-pointer px-[6px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
          onclick={() => onClose(tab.id)}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </li>
    {:else}
      <li class="px-[var(--space-2)] py-[6px] text-[13px] text-[var(--color-text-muted)]">
        Нет открытых книг
      </li>
    {/each}
  </ul>
</aside>
