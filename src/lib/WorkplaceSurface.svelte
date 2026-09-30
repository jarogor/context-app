<script lang="ts">
  import ReaderPage from './ReaderPage.svelte';
  import WorkplaceTabs from './WorkplaceTabs.svelte';
  import OpenBooksPanel from './OpenBooksPanel.svelte';
  import NotesPanel from './NotesPanel.svelte';
  import WorkspacesPage from './WorkspacesPage.svelte';
  import { activeTab } from './workplace';
  import type { WorkspaceRecord } from './workspace-registry';
  import type { Note, NoteListItem } from './notes';
  import type { QuoteAnchor } from './reader/anchor';

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
    /** Открыта ли панель заметок. */
    notesOpen: boolean;
    /** Элементы списка заметок книги активной вкладки. */
    notes: NoteListItem[];
    /** Загружаются ли заметки книги. */
    notesLoading: boolean;
    /** Есть ли активная книга. */
    hasBook: boolean;
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
    /** Добавление книги из файла. */
    onAddFile: () => void;
    /** Переключение панели открытых книг. */
    onToggleBooks: () => void;
    /** Переключение панели заметок. */
    onToggleNotes: () => void;
    /** Создание заметки-цитаты выделением в книге. */
    onQuote: (anchor: QuoteAnchor) => void;
    /** Удаление заметки. */
    onDeleteNote: (noteId: string) => void;
    /** Переход к заметке в тексте книги. */
    onGoToNote: (note: Note) => void;
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
    notesOpen,
    notes,
    notesLoading,
    hasBook,
    visible,
    onSelectTab,
    onCloseTab,
    onDuplicateTab,
    onAddBook,
    onAddFile,
    onToggleBooks,
    onToggleNotes,
    onQuote,
    onDeleteNote,
    onGoToNote,
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

  /** Элементы списка заметок книги активной вкладки. */
  const tabItems = $derived(tab ? notes : []);

  /** Заметки книги активной вкладки для подсветки. */
  const tabNotes = $derived(tabItems.map((item) => item.note));

  /** Читалка активной вкладки для перехода к заметке. */
  let reader: { goto: (note: Note) => void } | undefined = $state();

  /** Переход к заметке в читалке активной вкладки. */
  export function goto(note: Note) {
    reader?.goto(note);
  }
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
      {notesOpen}
      onSelect={onSelectTab}
      onClose={onCloseTab}
      onDuplicate={onDuplicateTab}
      onAdd={onAddBook}
      onAddFile={onAddFile}
      onToggleBooks={onToggleBooks}
      onToggleNotes={onToggleNotes}
      onBackToList={onBackToList}
    />
    <div class="flex min-h-0 flex-1">
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        {#if tab}
          {#key `${tab.id}:${tab.path}`}
            <ReaderPage
              bind:this={reader}
              path={tab.path}
              title={tab.title}
              initialZoom={tab.zoom}
              initialPosition={tab.position}
              notes={tabNotes}
              {visible}
              onStateChange={(state) => onTabState(tab.id, state)}
              onQuote={onQuote}
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
      {#if notesOpen}
        <NotesPanel
          items={tabItems}
          loading={notesLoading}
          {hasBook}
          onGoToNote={onGoToNote}
          onDeleteNote={onDeleteNote}
        />
      {/if}
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
