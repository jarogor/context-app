<script lang="ts">
  import { Button } from '@texture/ui';
  import type { WorkspaceTab } from './workplace';

  interface Props {
    /** Вкладки рабочего места. */
    tabs: WorkspaceTab[];
    /** Активная вкладка. */
    activeTabId: string | null;
    /** Имя активного рабочего места. */
    workspaceName: string;
    /** Открыта ли панель списка открытых книг. */
    booksOpen: boolean;
    /** Выбор вкладки. */
    onSelect: (id: string) => void;
    /** Закрытие вкладки. */
    onClose: (id: string) => void;
    /** Дублирование вкладки. */
    onDuplicate: (id: string) => void;
    /** Добавление книги (переход в библиотеку). */
    onAdd: () => void;
    /** Переключение панели открытых книг. */
    onToggleBooks: () => void;
    /** Возврат к списку рабочих мест. */
    onBackToList: () => void;
  }

  let {
    tabs,
    activeTabId,
    workspaceName,
    booksOpen,
    onSelect,
    onClose,
    onDuplicate,
    onAdd,
    onToggleBooks,
    onBackToList,
  }: Props = $props();
</script>

<div
  class="flex flex-[0_0_42px] items-center gap-[var(--space-2)] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-2)]"
  data-testid="workplace-tabs"
>
  <button
    type="button"
    data-testid="workplace-back-to-list"
    title="К списку рабочих мест"
    class="max-w-[180px] flex-none cursor-pointer truncate rounded-[var(--radius-sm)] px-[var(--space-2)] py-[4px] text-[13px] text-[var(--color-text-muted)] [font:inherit] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
    onclick={onBackToList}
  >
    {workspaceName}
  </button>
  <span class="text-[var(--color-border-strong)]" aria-hidden="true">|</span>
  <div class="flex min-w-0 flex-1 items-center gap-[2px] overflow-x-auto">
    {#each tabs as tab (tab.id)}
      <div
        class="flex flex-none items-center rounded-[var(--radius-md)] border"
        data-testid="workplace-tab-item"
        class:border-[var(--color-primary)]={tab.id === activeTabId}
        class:border-transparent={tab.id !== activeTabId}
        class:bg-[var(--color-bg)]={tab.id === activeTabId}
      >
        <button
          type="button"
          data-testid="workplace-tab"
          class="max-w-[200px] cursor-pointer truncate px-[var(--space-3)] py-[4px] text-[13px] [font:inherit]"
          aria-pressed={tab.id === activeTabId}
          title={tab.title}
          onclick={() => onSelect(tab.id)}
        >
          {tab.title}
        </button>
        <button
          type="button"
          title="Дублировать вкладку"
          aria-label="Дублировать вкладку"
          class="cursor-pointer px-[6px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          onclick={() => onDuplicate(tab.id)}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button
          type="button"
          data-testid="workplace-tab-close"
          title="Закрыть вкладку"
          aria-label="Закрыть вкладку"
          class="cursor-pointer px-[6px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
          onclick={() => onClose(tab.id)}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    {/each}
    <Button
      size="icon"
      variant="ghost"
      title="Добавить книгу"
      ariaLabel="Добавить книгу"
      onclick={onAdd}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </Button>
  </div>
  <Button
    variant={booksOpen ? 'primary' : 'secondary'}
    size="icon"
    title="Открытые книги"
    ariaLabel="Открытые книги"
    ariaPressed={booksOpen}
    onclick={onToggleBooks}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </Button>
</div>
