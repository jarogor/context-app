<script lang="ts">
  import { Button } from '@texture/ui';
  import type { WorkspaceTab } from './workplace';

  interface Props {
    /** Вкладки рабочего места. */
    tabs: WorkspaceTab[];
    /** Активная вкладка. */
    activeTabId: string | null;
    /** Открыта ли панель списка открытых книг. */
    booksOpen: boolean;
    /** Открыта ли панель заметок. */
    notesOpen: boolean;
    /** Выбор вкладки. */
    onSelect: (id: string) => void;
    /** Закрытие вкладки. */
    onClose: (id: string) => void;
    /** Дублирование вкладки. */
    onDuplicate: (id: string) => void;
    /** Добавление книги (переход в библиотеку). */
    onAdd: () => void;
    /** Открытие книги с диска как произвольного файла. */
    onAddFile: () => void;
    /** Переключение панели открытых книг. */
    onToggleBooks: () => void;
    /** Переключение панели заметок. */
    onToggleNotes: () => void;
    /** Возврат к списку рабочих мест. */
    onBackToList: () => void;
  }

  let {
    tabs,
    activeTabId,
    booksOpen,
    notesOpen,
    onSelect,
    onClose,
    onDuplicate,
    onAdd,
    onAddFile,
    onToggleBooks,
    onToggleNotes,
    onBackToList,
  }: Props = $props();
</script>

<div
  class="flex flex-[0_0_42px] items-center gap-2 bg-[var(--muted)] px-2"
  data-testid="workplace-tabs"
>
  <Button
    size="icon"
    variant="secondary"
    title="К списку рабочих мест"
    ariaLabel="К списку рабочих мест"
    onclick={onBackToList}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M15 6l-6 6 6 6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </Button>
  <span class="text-[var(--input)]" aria-hidden="true">|</span>
  <div class="flex min-w-0 flex-1 items-center gap-[2px] overflow-x-auto">
    {#each tabs as tab (tab.id)}
      <div
        class="flex flex-none items-center rounded-md {tab.id === activeTabId
          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
          : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'}"
        data-testid="workplace-tab-item"
      >
        <button
          type="button"
          data-testid="workplace-tab"
          class="max-w-[200px] cursor-pointer truncate px-3 py-[4px] text-[13px] [font:inherit]"
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
          class="cursor-pointer px-[6px] opacity-70 hover:opacity-100"
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
          class="cursor-pointer px-[6px] opacity-70 hover:opacity-100"
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
    <Button
      size="icon"
      variant="ghost"
      title="Открыть файл с диска"
      ariaLabel="Открыть файл с диска"
      onclick={onAddFile}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        />
      </svg>
    </Button>
  </div>
  <Button
    variant={notesOpen ? 'primary' : 'secondary'}
    size="icon"
    title="Заметки"
    ariaLabel="Заметки"
    ariaPressed={notesOpen}
    onclick={onToggleNotes}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M6 3.5h9.5L20 8v12.5H6Z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <path d="M15.5 3.5V8H20" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M9 12h7M9 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </Button>
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
