<script lang="ts">
  import WorkplaceTabPage, { type TabReader } from './WorkplaceTabPage.svelte';
  import WorkplaceTabs from './WorkplaceTabs.svelte';
  import OpenBooksPanel from './OpenBooksPanel.svelte';
  import NotesPanel from '../notes/NotesPanel.svelte';
  import WorkspacesPage from './WorkspacesPage.svelte';
  import { activeTab } from './workplace';
  import type { WorkspaceRecord } from './workspace-registry';
  import type { Note, NoteListItem, NoteSetSummary } from '../notes/notes';
  import type { QuoteAnchor } from '../reader/reader/anchor';

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
    /** Наборы заметок книги активной вкладки. */
    noteSets: NoteSetSummary[];
    /** Идентификатор активного набора книги. */
    activeSetId: string | null;
    /** Выбранная заметка для подсветки в списке. */
    selectedNoteId?: string | null;
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
    /** Клик по подсветке заметки в книге: открыть панель и выбрать заметку. */
    onSelectNote: (noteId: string) => void;
    /** Выбор активного набора заметок книги. */
    onSelectSet: (setId: string) => void;
    /** Создание набора заметок книги. */
    onCreateSet: (name: string) => void;
    /** Переименование набора заметок книги. */
    onRenameSet: (setId: string, name: string) => void;
    /** Удаление набора заметок книги. */
    onRemoveSet: (setId: string) => void;
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
    noteSets,
    activeSetId,
    notesLoading,
    hasBook,
    visible,
    selectedNoteId = null,
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
    onSelectNote,
    onSelectSet,
    onCreateSet,
    onRenameSet,
    onRemoveSet,
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

  /** Заметки каждой открытой книги рабочего места по идентификатору вкладки. */
  const notesByTab = $derived.by(() => {
    const currentId = tab?.id ?? null;
    const map: Record<string, Note[]> = {};
    for (const item of workspace?.tabs ?? []) {
      map[item.id] = item.id === currentId ? tabNotes : [];
    }
    return map;
  });

  /** Читалки открытых вкладок: переход к заметке адресуется активной. */
  const readers = new Map<string, TabReader>();

  /** Регистрация читалки вкладки и снятие её при размонтировании. */
  function registerReader(tabId: string, reader: TabReader | null) {
    if (reader) {
      readers.set(tabId, reader);
    } else {
      readers.delete(tabId);
    }
  }

  /** Переход к заметке в читалке активной вкладки. */
  export function goto(note: Note) {
    if (tab) {
      readers.get(tab.id)?.goto(note);
    }
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
        {#if workspace.tabs.length === 0}
          <div
            class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[var(--muted-foreground)]"
            data-testid="workplace-empty"
          >
            <p>Рабочее место пусто.</p>
            <p>Откройте книгу в библиотеке, чтобы добавить её вкладкой.</p>
          </div>
        {:else}
          <!--
            Все вкладки остаются смонтированными, а активная показывается:
            переключение не пересоздаёт документ книги и не запускает чтение
            заново — книга уже открыта и просто становится видимой.
          -->
          {#each workspace.tabs as item (item.id)}
            <div
              class="min-h-0 min-w-0 flex-1 flex-col"
              class:flex={item.id === workspace.activeTabId}
              class:hidden={item.id !== workspace.activeTabId}
              data-testid="workplace-tab-page"
              data-active={item.id === workspace.activeTabId ? 'true' : 'false'}
            >
              {#key `${item.id}:${item.path}`}
                <WorkplaceTabPage
                  tabId={item.id}
                  path={item.path}
                  title={item.title}
                  zoom={item.zoom}
                  position={item.position}
                  notes={notesByTab[item.id] ?? []}
                  active={item.id === workspace.activeTabId}
                  {visible}
                  onReader={registerReader}
                  onStateChange={(state) => onTabState(item.id, state)}
                  onQuote={onQuote}
                  onNoteClick={onSelectNote}
                  onRepoint={() => onRepointTab(item.id)}
                  onRemove={() => onCloseTab(item.id)}
                />
              {/key}
            </div>
          {/each}
        {/if}
      </div>
      {#if notesOpen}
        <NotesPanel
          items={tabItems}
          sets={noteSets}
          activeSetId={activeSetId}
          loading={notesLoading}
          {hasBook}
          selectedId={selectedNoteId}
          onGoToNote={onGoToNote}
          onDeleteNote={onDeleteNote}
          onSelectSet={onSelectSet}
          onCreateSet={onCreateSet}
          onRenameSet={onRenameSet}
          onRemoveSet={onRemoveSet}
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
