<script lang="ts">
  import ReaderPage from './ReaderPage.svelte';
  import WorkplaceTabs from './WorkplaceTabs.svelte';
  import OpenBooksPanel from './OpenBooksPanel.svelte';
  import WorkspacesPage from './WorkspacesPage.svelte';
  import { activeTab } from './workplace';
  import type { WorkspaceRecord } from './workspace-registry';

  interface Props {
    /** Активное рабочее место или null, когда его нет. */
    workspace: WorkspaceRecord | null;
    /** Рабочие места для списка. */
    workspaces: WorkspaceRecord[];
    /** Идентификатор активного рабочего места. */
    activeWorkspaceId: string | null;
    /** Показывать ли список рабочих мест вместо вкладок. */
    listMode: boolean;
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
    /** Возврат к списку рабочих мест. */
    onBackToList: () => void;
    /** Создание рабочего места. */
    onCreateWorkspace: (name: string) => void;
    /** Открытие рабочего места. */
    onOpenWorkspace: (id: string) => void;
    /** Переименование рабочего места. */
    onRenameWorkspace: (id: string, name: string) => void;
    /** Удаление рабочего места. */
    onRemoveWorkspace: (id: string) => void;
  }

  let {
    workspace,
    workspaces,
    activeWorkspaceId,
    listMode,
    booksOpen,
    visible,
    onSelectTab,
    onCloseTab,
    onDuplicateTab,
    onAddBook,
    onToggleBooks,
    onTabState,
    onRepointTab,
    onBackToList,
    onCreateWorkspace,
    onOpenWorkspace,
    onRenameWorkspace,
    onRemoveWorkspace,
  }: Props = $props();

  const tab = $derived(
    workspace ? activeTab({ tabs: workspace.tabs, activeTabId: workspace.activeTabId }) : null,
  );
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="workplace-surface">
  {#if listMode || workspace === null}
    <WorkspacesPage
      {workspaces}
      activeId={activeWorkspaceId}
      onCreate={onCreateWorkspace}
      onOpen={onOpenWorkspace}
      onRename={onRenameWorkspace}
      onRemove={onRemoveWorkspace}
    />
  {:else}
    <WorkplaceTabs
      tabs={workspace.tabs}
      activeTabId={workspace.activeTabId}
      workspaceName={workspace.name}
      {booksOpen}
      onSelect={onSelectTab}
      onClose={onCloseTab}
      onDuplicate={onDuplicateTab}
      onAdd={onAddBook}
      onToggleBooks={onToggleBooks}
      onBackToList={onBackToList}
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
  {/if}
</div>
