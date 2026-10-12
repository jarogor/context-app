<script lang="ts">
  import WorkplaceTabPage, { type TabReader } from './WorkplaceTabPage.svelte';
  import WorkplaceTabs from './WorkplaceTabs.svelte';
  import OpenBooksPanel from './OpenBooksPanel.svelte';
  import NotesPanel from '../notes/NotesPanel.svelte';
  import NoteToolbar from './NoteToolbar.svelte';
  import ReaderFooter from '../reader/ReaderFooter.svelte';
  import type { FooterSnapshot } from '../reader/ReaderPage.svelte';
  import WorkspacesPage from './WorkspacesPage.svelte';
  import { activeTab } from './workplace';
  import type { TabAppearancePatch } from './workplace';
  import type { WorkspaceRecord } from './workspace-registry';
  import type { Note, NoteListItem, NoteSetSummary, NoteTool, NoteType, ShapeKind } from '../notes/notes';
  import { NOTE_TYPES } from '../notes/notes';
  import type { QuoteAnchor } from '../reader/reader/anchor';
  import type { NoteColor } from '../notes/notes';
  import { DEFAULT_READER_THEME, type PaletteId, type ReaderThemeId } from '@texture/ui';

  interface Props {
    /** Текущее рабочее место или null, когда его нет. */
    workspace: WorkspaceRecord | null;
    /** Рабочие места для списка. */
    workspaces: WorkspaceRecord[];
    /** Идентификатор текущего (открытого) рабочего места. */
    currentWorkspaceId: string | null;
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
    /** Правка оформления вкладки. */
    onEditTabAppearance: (id: string, patch: TabAppearancePatch) => void;
    /** Добавление книги. */
    onAddBook: () => void;
    /** Добавление книги из файла. */
    onAddFile: () => void;
    /** Переключение панели открытых книг. */
    onToggleBooks: () => void;
    /** Переключение панели заметок. */
    onToggleNotes: () => void;
    /** Закрытие панели заметок (автозакрытие при переходе к заметке). */
    onCloseNotes: () => void;
    /** Создание заметки-цитаты выделением в книге. */
    onQuote: (anchor: QuoteAnchor, color: NoteColor) => void;
    /** Подтверждение текстовой карточки. */
    onTextNote: (anchor: QuoteAnchor, text: string, color: NoteColor) => void;
    /** Правка текста и цвета существующей текстовой карточки. */
    onEditNoteText: (noteId: string, text: string, color: NoteColor) => void;
    /** Готовая заметка-фигура. */
    onShape: (anchor: QuoteAnchor, shape: ShapeKind, geometry: string, color: NoteColor) => void;
    /** Активный инструмент создания заметок. */
    tool: NoteTool;
    /** Смена активного инструмента заметок. */
    onToolChange: (tool: NoteTool) => void;
    /** Лимит числа открытых вкладок рабочего места. */
    openTabsLimit: number;
    /** Тема области чтения (светлая или тёмная). */
    readerTheme?: ReaderThemeId;
    /** Палитра оформления: общий реестр дизайн-системы. */
    palette?: PaletteId;
    /** Смена темы области чтения (нижняя панель читалки). */
    onChangeReaderTheme?: (theme: ReaderThemeId) => void;
    /** Доступные типы заметок текущего формата (текучий — только цитата). */
    allowedNoteTypes?: readonly NoteType[];
    /** Удаление заметки. */
    onDeleteNote: (noteId: string) => void;
    /** Смена цвета подсветки заметки. */
    onChangeNoteColor: (noteId: string, color: NoteColor) => void;
    /** Изменение названия и комментария заметки. */
    onEditNote: (noteId: string, details: { title: string; comment: string }) => void;
    /** Переход к заметке в тексте книги. */
    onGoToNote: (note: Note) => void;
    /** Клик по подсветке заметки в книге: открыть панель и выбрать заметку. */
    onSelectNote: (noteId: string) => void;
    /** Перемещение заметки или сдвиг границ цитаты. */
    onPlaceNote?: (noteId: string, anchor: QuoteAnchor, geometry?: string) => void;
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
    currentWorkspaceId,
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
    onEditTabAppearance,
    onAddBook,
    onAddFile,
    onToggleBooks,
    onToggleNotes,
    onCloseNotes,
    onQuote,
    onTextNote,
    onEditNoteText,
    onShape,
    tool,
    onToolChange,
    openTabsLimit,
    readerTheme = DEFAULT_READER_THEME,
    palette,
    onChangeReaderTheme,
    allowedNoteTypes = NOTE_TYPES,
    onDeleteNote,
    onChangeNoteColor,
    onEditNote,
    onGoToNote,
    onSelectNote,
    onPlaceNote,
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

  /** Снимок нижней панели по идентификатору вкладки. */
  let footerByTab: Record<string, FooterSnapshot> = $state({});

  /** Снимок нижней панели активной вкладки. */
  const activeFooter = $derived(tab ? (footerByTab[tab.id] ?? null) : null);

  /** Точка перелома «узкое окно»: та же, что у панели уведомлений. */
  const NARROW_WINDOW_QUERY = '(max-width: 899px)';

  /** Узкое ли сейчас окно (для автозакрытия панели заметок на её ширине). */
  function isNarrowWindow(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(NARROW_WINDOW_QUERY).matches;
  }

  /** Регистрация читалки вкладки и снятие её при размонтировании. */
  function registerReader(tabId: string, reader: TabReader | null) {
    if (reader) {
      readers.set(tabId, reader);
    } else {
      readers.delete(tabId);
    }
  }

  /** Сохранение снимка нижней панели вкладки. */
  function handleFooter(tabId: string, snapshot: FooterSnapshot) {
    footerByTab = { ...footerByTab, [tabId]: snapshot };
  }

  /** Изменение масштаба активной вкладки из нижней панели. */
  function changeZoom(delta: number) {
    if (tab) {
      readers.get(tab.id)?.changeFooterZoom(delta);
    }
  }

  /** Переход к соседней странице активной вкладки из нижней панели. */
  function stepPage(delta: number) {
    if (tab) {
      readers.get(tab.id)?.stepFooterPage(delta);
    }
  }

  /** Переход к заданному номеру страницы активной вкладки из нижней панели. */
  function goToPage(page: number) {
    if (tab) {
      readers.get(tab.id)?.gotoFooterPage(page);
    }
  }

  /** Переход к заметке в читалке активной вкладки. */
  export function goto(note: Note) {
    if (tab) {
      readers.get(tab.id)?.goto(note);
    }
  }

  /** Выбор заметки в панели: переход к ней, на узком окне — автозакрытие панели.
   *
   * Панель на всю ширину кроет страницу текста, и без закрытия пользователь не
   * увидел бы результат перехода. На широком окне панель остаётся открытой.
   */
  function selectNoteInPanel(note: Note) {
    onGoToNote(note);
    if (isNarrowWindow()) {
      onCloseNotes();
    }
  }
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="workplace-surface">
  {#if listMode || workspace === null}
    <WorkspacesPage
      {workspaces}
      currentId={currentWorkspaceId}
      onCreate={onCreateWorkspace}
      onOpen={onOpenWorkspace}
      onRename={onRenameWorkspace}
      onRemove={onRemoveWorkspace}
    />
  {:else}
    <WorkplaceTabs
      tabs={workspace.tabs}
      activeTabId={workspace.activeTabId}
      {booksOpen}
      {notesOpen}
      {openTabsLimit}
      onSelect={onSelectTab}
      onClose={onCloseTab}
      onDuplicate={onDuplicateTab}
      onAdd={onAddBook}
      onAddFile={onAddFile}
      onToggleBooks={onToggleBooks}
      onToggleNotes={onToggleNotes}
      onBackToList={onBackToList}
    />
    {#if workspace.tabs.length > 0}
      <NoteToolbar
        {tool}
        allowedTypes={allowedNoteTypes}
        onChange={onToolChange}
        zoom={activeFooter?.zoom ?? 100}
        minZoom={activeFooter?.minZoom ?? 60}
        maxZoom={activeFooter?.maxZoom ?? 220}
        showZoom={activeFooter?.workplaceZoom ?? true}
        {readerTheme}
        onChangeZoom={changeZoom}
        onChangeReaderTheme={(theme) => onChangeReaderTheme?.(theme)}
      />
    {/if}
    <div class="relative flex min-h-0 flex-1">
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
                  {tool}
                  {readerTheme}
                  {palette}
                  active={item.id === workspace.activeTabId}
                  {visible}
                  onReader={registerReader}
                  onStateChange={(state) => onTabState(item.id, state)}
                  onFooter={(snapshot) => handleFooter(item.id, snapshot)}
                  onQuote={onQuote}
                  onTextNote={onTextNote}
                  onEditNoteText={onEditNoteText}
                  onShape={onShape}
                  onNoteClick={onSelectNote}
                  onPlaceNote={onPlaceNote}
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
          {readerTheme}
          {palette}
          loading={notesLoading}
          {hasBook}
          selectedId={selectedNoteId}
          onGoToNote={selectNoteInPanel}
          onDeleteNote={onDeleteNote}
          onChangeColor={onChangeNoteColor}
          onEditNote={onEditNote}
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
          onEditAppearance={onEditTabAppearance}
        />
      {/if}
    </div>
    {#if workspace.tabs.length > 0}
      <ReaderFooter
        workplace={activeFooter?.workplace ?? false}
        workplacePages={activeFooter?.workplacePages ?? false}
        workplacePage={activeFooter?.page ?? null}
        workplacePageCount={activeFooter?.pageCount ?? null}
        progress={activeFooter?.progress ?? 0}
        onStepPage={stepPage}
        onGoToPage={goToPage}
      />
    {/if}
  {/if}
</div>
