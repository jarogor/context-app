<script lang="ts">
  import ReaderPage from './ReaderPage.svelte';
  import WorkplaceTabs from './WorkplaceTabs.svelte';
  import OpenBooksPanel from './OpenBooksPanel.svelte';
  import { activeTab, type WorkspaceState } from './workplace';

  interface Props {
    /** Состояние рабочего места. */
    workspace: WorkspaceState;
    /** Открыта ли панель списка открытых книг. */
    booksOpen: boolean;
    /** Видима ли поверхность рабочего места. */
    visible: boolean;
    /** Выбор вкладки. */
    onSelectTab: (id: string) => void;
    /** Закрытие вкладки. */
    onCloseTab: (id: string) => void;
    /** Дублирование вкладки. */
    onDuplicateTab: (id: string) => void;
    /** Добавление книги. */
    onAddBook: () => void;
    /** Переключение панели открытых книг. */
    onToggleBooks: () => void;
    /** Изменение состояния чтения вкладки. */
    onTabState: (id: string, state: { zoom: number; position: number }) => void;
    /** Просьба переуказать файл недоступной книги вкладки. */
    onRepointTab: (id: string) => void;
  }

  let {
    workspace,
    booksOpen,
    visible,
    onSelectTab,
    onCloseTab,
    onDuplicateTab,
    onAddBook,
    onToggleBooks,
    onTabState,
    onRepointTab,
  }: Props = $props();

  const tab = $derived(activeTab(workspace));
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="workplace-surface">
  <WorkplaceTabs
    tabs={workspace.tabs}
    activeTabId={workspace.activeTabId}
    {booksOpen}
    onSelect={onSelectTab}
    onClose={onCloseTab}
    onDuplicate={onDuplicateTab}
    onAdd={onAddBook}
    onToggleBooks={onToggleBooks}
  />
  <div class="flex min-h-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      {#if tab}
        {#key `${tab.id}:${tab.bookId}`}
          <ReaderPage
            bookId={tab.bookId}
            title={tab.title}
            initialZoom={tab.zoom}
            initialPosition={tab.position}
            {visible}
            onStateChange={(state) => onTabState(tab.id, state)}
            onRepoint={() => onRepointTab(tab.id)}
            onRemove={() => onCloseTab(tab.id)}
          />
        {/key}
      {:else}
        <div
          class="flex h-full flex-col items-center justify-center gap-[var(--space-2)] p-[var(--space-5)] text-center text-[var(--color-text-muted)]"
          data-testid="workplace-empty"
        >
          <p>Рабочее место пусто.</p>
          <p>Откройте книгу в библиотеке, чтобы добавить её вкладкой.</p>
        </div>
      {/if}
    </div>
    {#if booksOpen}
      <OpenBooksPanel
        tabs={workspace.tabs}
        activeTabId={workspace.activeTabId}
        onSelect={onSelectTab}
        onClose={onCloseTab}
      />
    {/if}
  </div>
</div>
