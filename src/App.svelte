<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Badge, Button, Menu, MenuItem } from '@texture/ui';
  import PluginFrame from './lib/PluginFrame.svelte';
  import LibrariesPage from './lib/LibrariesPage.svelte';
  import WorkplaceSurface from './lib/WorkplaceSurface.svelte';
  import {
    closeTab,
    duplicateTab,
    openBook,
    replaceTabBook,
    updateTab,
    activateTab,
    activeTab,
  } from './lib/workplace';
  import {
    activeWorkspace,
    createWorkspace,
    removeWorkspace,
    renameWorkspace,
    selectWorkspace,
    serializeRegistry,
    updateActiveWorkspaceTabs,
    type WorkspaceRegistry,
  } from './lib/workspace-registry';
  import type { ActiveLibrary } from './lib/bootstrap';
  import {
    addQuote,
    bookKey,
    createSet,
    deleteNote,
    DEFAULT_SET_NAME,
    findSet,
    noteList,
    type Note,
  } from './lib/notes';
  import type { QuoteAnchor } from './lib/reader/anchor';
  import { formatFromPath } from './lib/reader';
  import { invokeCommand, listenEvent, openDialog } from './lib/app-bridge';

  /** Сообщение frontend-плагина без идентификатора запроса. */
  interface PluginMessage {
    type?: string;
    value?: unknown;
  }

  interface Props {
    /** Реестр рабочих мест, загруженный до первого рендера. */
    initialRegistry: WorkspaceRegistry;
    /** Активная библиотека, загруженная до первого рендера. */
    initialLibrary: ActiveLibrary | null;
  }

  let { initialRegistry, initialLibrary }: Props = $props();

  /** Страница раздела настроек. */
  type SettingsSection = 'general' | 'plugins';

  /** Открыт ли раздел настроек; состояние принадлежит оболочке. */
  let settingsOpen = $state(false);

  /** Выбранная страница раздела настроек. */
  let settingsSection = $state<SettingsSection>('general');

  /** Открыта ли страница «Библиотеки»; состояние принадлежит оболочке. */
  let librariesOpen = $state(false);

  /** Открыта ли панель уведомлений; состояние принадлежит оболочке. */
  let notificationsOpen = $state(false);

  /** Число непрочитанных уведомлений, полученное от frontend-плагина. */
  let unreadCount = $state(0);

  /** Есть ли неприменённые изменения активности плагинов. */
  let activationPending = $state(false);

  /** Активная библиотека для шапки. */
  let activeLibrary: ActiveLibrary | null = $state(untrack(() => initialLibrary));

  /** Открыта ли поверхность рабочего места; принадлежит оболочке. */
  let workspaceOpen = $state(true);

  /** Показывается ли список рабочих мест вместо вкладок; точка входа приложения. */
  let workspaceListMode = $state(true);

  /** Открыта ли панель списка открытых книг. */
  let booksPanelOpen = $state(false);

  /** Открыта ли панель заметок. */
  let notesPanelOpen = $state(false);

  /** Номер внешнего изменения заметок из события хранилища. */
  let notesRevision = $state(0);

  /** Ошибка операций заметок для сообщения в шапке. */
  let notesError = $state<string | null>(null);

  /** Заметки-цитаты книги активной вкладки. */
  let notes: Note[] = $state([]);

  /** Идёт ли загрузка заметок книги. */
  let notesLoading = $state(false);

  /** Идентификатор набора заметок книги. */
  let notesSetId: string | null = $state(null);

  /** Читалка активной вкладки для перехода к заметке. */
  let reader: { goto: (note: Note) => void } | undefined = $state();

  /** Реестр рабочих мест и активное место (загружен до первого рендера). */
  let registry: WorkspaceRegistry = $state(untrack(() => initialRegistry));

  /** Активное рабочее место. */
  const workspace = $derived(activeWorkspace(registry));

  /** Активная вкладка активного рабочего места. */
  const currentTab = $derived(
    workspace ? activeTab({ tabs: workspace.tabs, activeTabId: workspace.activeTabId }) : null,
  );

  /** Ключ книги активной вкладки для заметок.
   *
   * Вложение вкладки — путь к файлу, поэтому ключ строится по пути: одна и та
   * же книга в разных вкладках и рабочих местах делит заметки.
   */
  const notesBookKey = $derived.by(() => {
    const tab = currentTab;
    return tab ? bookKey(tab.path) : null;
  });

  /** Вкладка, для которой выбирается новая книга (переуказание файла). */
  let repointTabId: string | null = $state(null);

  /** Имя активной библиотеки по последнему сегменту пути. */
  function libraryName(): string | null {
    const library = activeLibrary;
    if (!library?.path) {
      return null;
    }
    return library.path.split(/[\\/]/).filter(Boolean).pop() ?? library.path;
  }

  /** Показан ли основной раздел библиотеки. */
  function isMainSection(): boolean {
    return !settingsOpen && !librariesOpen && !workspaceOpen;
  }

  /** Показывать ли в шапке имя активной библиотеки. */
  function showLibrary(): boolean {
    return activeLibrary !== null && (isMainSection() || workspaceOpen);
  }

  /** Название текущего раздела в верхней панели. */
  const sectionTitle = $derived(
    librariesOpen
      ? 'Библиотеки'
      : settingsOpen
        ? settingsSection === 'plugins'
          ? 'Плагины'
          : 'Настройки'
        : workspaceOpen
          ? 'Рабочее место'
          : 'Библиотека',
  );

  /** Показывать ли в шапке название раздела помимо имени библиотеки. */
  function showSectionLabel(): boolean {
    return !(isMainSection() && activeLibrary !== null);
  }

  /** Переключение раздела настроек; закрывает другие поверхности. */
  function toggleSettings() {
    settingsOpen = !settingsOpen;
    if (settingsOpen) {
      librariesOpen = false;
      workspaceOpen = false;
    }
  }

  /** Переключение страницы «Библиотеки»; закрывает другие поверхности. */
  function toggleLibraries() {
    librariesOpen = !librariesOpen;
    if (librariesOpen) {
      settingsOpen = false;
      workspaceOpen = false;
    }
  }

  /** Переключение поверхности рабочего места. */
  function toggleWorkspace() {
    workspaceOpen = !workspaceOpen;
    if (workspaceOpen) {
      settingsOpen = false;
      librariesOpen = false;
      workspaceListMode = false;
    }
  }

  /** Выбор страницы раздела настроек. */
  function selectSettingsSection(section: SettingsSection) {
    settingsSection = section;
  }

  /** Переключение панели уведомлений. */
  function toggleNotifications() {
    notificationsOpen = !notificationsOpen;
  }

  /** Выбор активной вкладки. */
  function selectTab(id: string) {
    registry = updateActiveWorkspaceTabs(registry, (state) => activateTab(state, id));
  }

  /** Закрытие вкладки. */
  function removeTab(id: string) {
    registry = updateActiveWorkspaceTabs(registry, (state) => closeTab(state, id));
  }

  /** Дублирование вкладки. */
  function duplicateCurrentTab(id: string) {
    registry = updateActiveWorkspaceTabs(registry, (state) => duplicateTab(state, id));
  }

  /** Изменение состояния чтения вкладки. */
  function handleTabState(id: string, state: { zoom: number; position: number }) {
    registry = updateActiveWorkspaceTabs(registry, (current) => updateTab(current, id, state));
  }

  /** Переключение панели списка открытых книг. */
  function toggleBooksPanel() {
    booksPanelOpen = !booksPanelOpen;
  }

  /** Переключение панели заметок. */
  function toggleNotesPanel() {
    notesPanelOpen = !notesPanelOpen;
    if (notesPanelOpen) {
      void loadNotes();
    }
  }

  /** Элементы списка заметок-цитат для панели. */
  const noteItems = $derived(noteList(notes));

  /** Набор заметок книги активной вкладки.
   *
   * Набор заводится при первой заметке; пока заметок нет, набор может не
   * существовать.
   */
  async function loadNotes() {
    const key = notesBookKey;
    if (!key) {
      notes = [];
      notesSetId = null;
      return;
    }
    notesLoading = true;
    try {
      const set = await findSet(key);
      notes = set?.notes ?? [];
      notesSetId = set?.id ?? null;
      notesError = null;
    } catch (error) {
      notesError = String(error);
    } finally {
      notesLoading = false;
    }
  }

  /** Добавление заметки-цитаты, созданной выделением в книге. */
  async function addQuoteFromSelection(anchor: QuoteAnchor) {
    const key = notesBookKey;
    if (!key) {
      return;
    }
    try {
      const set = notesSetId
        ? { id: notesSetId, bookKey: key, name: '', createdAtMillis: 0, notes }
        : await createSet(key, DEFAULT_SET_NAME);
      notesSetId = set.id;
      const updated = await addQuote(key, anchor, set);
      notes = updated.notes;
      notesError = null;
    } catch (error) {
      notesError = String(error);
    }
  }

  /** Удаление заметки-цитаты. */
  async function removeNote(noteId: string) {
    const key = notesBookKey;
    if (!key || !notesSetId) {
      return;
    }
    try {
      const updated = await deleteNote(key, notesSetId, noteId);
      notes = updated.notes;
      notesError = null;
    } catch (error) {
      notesError = String(error);
    }
  }

  /** Переход чтения к заметке в тексте книги. */
  function goToNote(note: Note) {
    reader?.goto(note);
  }

  /** Загрузка заметок при смене книги активной вкладки. */
  $effect(() => {
    const key = notesBookKey;
    if (!key) {
      notes = [];
      notesSetId = null;
      return;
    }
    void loadNotes();
  });

  /** Перечитывание заметок при внешнем изменении хранилища. */
  $effect(() => {
    const marker = notesRevision;
    if (marker === 0) {
      return;
    }
    void loadNotes();
  });

  /** Возврат к списку рабочих мест. */
  function backToList() {
    workspaceListMode = true;
  }

  /** Создание рабочего места. */
  function createNewWorkspace(name: string) {
    registry = createWorkspace(registry, name);
    workspaceListMode = false;
  }

  /** Открытие рабочего места из списка. */
  function openWorkspace(id: string) {
    registry = selectWorkspace(registry, id);
    workspaceListMode = false;
  }

  /** Переименование рабочего места. */
  function renameExistingWorkspace(id: string, name: string) {
    registry = renameWorkspace(registry, id, name);
  }

  /** Удаление рабочего места. */
  function removeExistingWorkspace(id: string) {
    registry = removeWorkspace(registry, id);
    if (registry.activeWorkspaceId === null) {
      workspaceListMode = true;
    }
  }

  /** Переход к библиотеке для добавления книги в рабочее место. */
  function requestAddBook() {
    workspaceOpen = false;
    librariesOpen = false;
    settingsOpen = false;
  }

  /** Переуказание файла недоступной книги вкладки.
   *
   * Рабочее место не знает, откуда книга: пользователь выбирает любой файл на
   * диске, как при добавлении вложения.
   */
  function requestRepoint(tabId: string) {
    repointTabId = tabId;
    void chooseBookFile();
  }

  /** Выбор файла книги на диске и открытие его вкладкой или переуказание. */
  async function chooseBookFile() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        { name: 'Книги', extensions: ['epub', 'pdf', 'djvu', 'fb2'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    const chosen = Array.isArray(selected) ? selected[0] : selected;
    if (typeof chosen !== 'string' || !chosen) {
      repointTabId = null;
      return;
    }
    const book = {
      path: chosen,
      title: fileName(chosen),
      format: formatFromPath(chosen),
    };
    if (repointTabId) {
      registry = updateActiveWorkspaceTabs(registry, (state) =>
        replaceTabBook(state, repointTabId as string, book),
      );
      repointTabId = null;
    } else {
      registry = updateActiveWorkspaceTabs(registry, (state) => openBook(state, book), true);
    }
    workspaceOpen = true;
    workspaceListMode = false;
    settingsOpen = false;
    librariesOpen = false;
  }

  /** Человекочитаемое имя книги по последнему сегменту пути. */
  function fileName(path: string): string {
    return (
      path.split(/[\\/]/).filter(Boolean).pop()?.replace(/\.[^.]+$/, '') ?? path
    );
  }

  /** Открытие книги вкладкой рабочего места по сообщению библиотечного плагина. */
  function handleLibraryMessage(message: PluginMessage) {
    if (message.type !== 'workspace:open-book') {
      return;
    }
    const value = message.value as
      | { path?: unknown; title?: unknown; format?: unknown }
      | null
      | undefined;
    if (!value?.path) {
      return;
    }
    const book = {
      path: String(value.path),
      title: String(value.title ?? '') || fileName(String(value.path)),
      format: value.format ? String(value.format) : formatFromPath(String(value.path)),
    };
    if (repointTabId) {
      registry = updateActiveWorkspaceTabs(registry, (state) =>
        replaceTabBook(state, repointTabId as string, book),
      );
      repointTabId = null;
    } else {
      registry = updateActiveWorkspaceTabs(registry, (state) => openBook(state, book), true);
    }
    workspaceOpen = true;
    workspaceListMode = false;
    settingsOpen = false;
    librariesOpen = false;
  }

  /** Обработка сообщений frontend-плагинов без ответа. */
  function handlePluginMessage(message: PluginMessage) {
    if (message.type === 'notifications-count' && typeof message.value === 'number') {
      unreadCount = message.value;
    }
  }

  /** Обработка сообщений плагина стора. */
  function handleStoreMessage(message: PluginMessage) {
    if (message.type === 'activation-pending') {
      activationPending = Boolean(message.value);
    }
  }

  /** Обновление сведений об активной библиотеке из ядра. */
  async function refreshActiveLibrary() {
    try {
      const result = (await invokeCommand('active_library', {})) as ActiveLibrary | null;
      activeLibrary = result?.path ? result : null;
    } catch {
      activeLibrary = null;
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    let unlistenNotes: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('source-catalog-changed', (value) => {
        const payload = value as ActiveLibrary | null;
        if (payload?.path) {
          activeLibrary = payload;
        } else {
          void refreshActiveLibrary();
        }
      });
      unlistenNotes = await listenEvent('notes:changed', () => {
        notesRevision += 1;
      });
    })();
    return () => {
      unlisten?.();
      unlistenNotes?.();
    };
  });

  /** Сообщение об ошибке загрузки или сохранения реестра. */
  let registryError = $state<string | null>(null);

  /** Сохранение реестра рабочих мест с небольшой задержкой. */
  $effect(() => {
    const snapshot = $state.snapshot(registry);
    const timer = setTimeout(() => {
      void saveRegistry(snapshot);
    }, 300);
    return () => clearTimeout(timer);
  });

  /** Сохранение снимка реестра в ядро с сообщением об ошибке. */
  async function saveRegistry(snapshot: WorkspaceRegistry) {
    try {
      await invokeCommand('save_workspaces', { workspaces: serializeRegistry(snapshot) });
      registryError = null;
    } catch (error) {
      registryError = String(error);
    }
  }
</script>

<div class="flex h-full flex-col">
  <header
    class="flex flex-[0_0_48px] items-center gap-[var(--space-3)] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)]"
  >
    <span class="text-base font-bold text-[var(--color-primary)]">Текстура</span>
    {#if showLibrary()}
      {#if activeLibrary?.provider_name}
        <Badge>{activeLibrary.provider_name}</Badge>
      {/if}
      <span
        class="max-w-[280px] truncate text-sm text-[var(--color-text-muted)]"
        title={activeLibrary?.path ?? ''}
      >
        {libraryName()}
      </span>
    {/if}
    {#if showSectionLabel()}
      <span class="text-sm text-[var(--color-text-muted)]">{sectionTitle}</span>
    {/if}
    <div class="ml-auto flex items-center gap-[var(--space-2)]">
      {#if registryError}
        <span
          class="whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--color-danger)] px-[var(--space-2)] py-[2px] text-[12px] text-[var(--color-danger)]"
          title={registryError}
        >
          Не удалось сохранить рабочее место
        </span>
      {/if}
      {#if notesError}
        <span
          class="whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--color-danger)] px-[var(--space-2)] py-[2px] text-[12px] text-[var(--color-danger)]"
          title={notesError}
        >
          Ошибка заметок
        </span>
      {/if}
      {#if activationPending}
        <span
          class="whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--color-warning)] px-[var(--space-2)] py-[2px] text-[12px] text-[var(--color-warning)]"
          title="Изменения плагинов применятся после перезапуска приложения или переоткрытия библиотеки"
        >
          Нужен перезапуск
        </span>
      {/if}
      <Button
        variant={notificationsOpen ? 'primary' : 'secondary'}
        size="icon"
        title="Уведомления"
        ariaLabel="Уведомления"
        ariaPressed={notificationsOpen}
        class="relative"
        onclick={toggleNotifications}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-5v-1l-1.7-1.7V10a5.3 5.3 0 0 0-4-5.2V4a1.3 1.3 0 0 0-2.6 0v.8A5.3 5.3 0 0 0 6.7 10v4.3L5 16v1Z"
            fill="currentColor"
          />
        </svg>
        <span
          class="absolute -top-[6px] -right-[6px] flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] text-[11px] font-bold text-[var(--color-primary-fg)]"
          style:background={unreadCount === 0
            ? 'var(--color-border-strong)'
            : 'var(--color-success)'}
        >
          {unreadCount}
        </span>
      </Button>
      <Button
        variant={librariesOpen ? 'primary' : 'secondary'}
        size="icon"
        title="Библиотеки"
        ariaLabel="Библиотеки"
        ariaPressed={librariesOpen}
        onclick={toggleLibraries}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="4" y="3.5" width="4.5" height="17" rx="1" fill="currentColor" />
          <rect x="10" y="3.5" width="4.5" height="17" rx="1" fill="currentColor" />
          <path
            d="M16.2 4.3a1 1 0 0 1 1.25.7l3.1 14.2a1 1 0 0 1-.75 1.2l-1.9.45a1 1 0 0 1-1.2-.75L13.6 5.9a1 1 0 0 1 .75-1.2Z"
            fill="currentColor"
          />
        </svg>
      </Button>
      <Button
        variant={workspaceOpen ? 'primary' : 'secondary'}
        size="icon"
        title="Рабочее место"
        ariaLabel="Рабочее место"
        ariaPressed={workspaceOpen}
        onclick={toggleWorkspace}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="2"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          />
          <path d="M3.5 8.5h17" stroke="currentColor" stroke-width="2" />
          <path d="M9 8.5V20" stroke="currentColor" stroke-width="2" />
        </svg>
      </Button>
      <Button
        variant={settingsOpen ? 'primary' : 'secondary'}
        size="icon"
        title="Настройки"
        ariaLabel="Настройки"
        ariaPressed={settingsOpen}
        onclick={toggleSettings}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </Button>
    </div>
  </header>

  <div class="flex min-h-0 flex-1 overflow-hidden">
    <main class="flex min-w-0 flex-1">
      <div
        class="min-h-0 min-w-0 flex-1"
        class:hidden={settingsOpen || librariesOpen || workspaceOpen}
      >
        <PluginFrame
          src="/plugins/library-ui/index.html"
          title="Library plugin"
          onMessage={handleLibraryMessage}
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!workspaceOpen}>
        <WorkplaceSurface
          bind:this={reader}
          workspace={workspace}
          workspaces={registry.workspaces}
          activeWorkspaceId={registry.activeWorkspaceId}
          listMode={workspaceListMode}
          booksOpen={booksPanelOpen}
          notesOpen={notesPanelOpen}
          notes={noteItems}
          notesLoading={notesLoading}
          hasBook={notesBookKey !== null}
          visible={workspaceOpen}
          onSelectTab={selectTab}
          onCloseTab={removeTab}
          onDuplicateTab={duplicateCurrentTab}
          onAddBook={requestAddBook}
          onAddFile={chooseBookFile}
          onToggleBooks={toggleBooksPanel}
          onToggleNotes={toggleNotesPanel}
          onQuote={addQuoteFromSelection}
          onDeleteNote={removeNote}
          onGoToNote={goToNote}
          onTabState={handleTabState}
          onRepointTab={requestRepoint}
          onBackToList={backToList}
          onCreateWorkspace={createNewWorkspace}
          onOpenWorkspace={openWorkspace}
          onRenameWorkspace={renameExistingWorkspace}
          onRemoveWorkspace={removeExistingWorkspace}
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!librariesOpen}>
        <LibrariesPage onOpened={() => (librariesOpen = false)} />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!settingsOpen}>
        <Menu
          ariaLabel="Разделы настроек"
          class="flex-[0_0_200px] border-r border-[var(--color-border)] bg-[var(--color-bg)] p-[var(--space-3)]"
        >
          <MenuItem active={settingsSection === 'general'} onclick={() => selectSettingsSection('general')}>
            Настройки
          </MenuItem>
          <MenuItem active={settingsSection === 'plugins'} onclick={() => selectSettingsSection('plugins')}>
            Плагины
          </MenuItem>
        </Menu>
        <div class="flex min-h-0 min-w-0 flex-1">
          <div class="min-h-0 min-w-0 flex-1" class:hidden={settingsSection !== 'general'}>
            <PluginFrame src="/plugins/settings-ui/index.html" title="Settings plugin" />
          </div>
          <div class="min-h-0 min-w-0 flex-1" class:hidden={settingsSection !== 'plugins'}>
            <PluginFrame
              src="/plugins/plugin-store-ui/index.html"
              title="Plugin store"
              onMessage={handleStoreMessage}
            />
          </div>
        </div>
      </div>
    </main>
    <aside
      class="flex min-w-0 flex-[0_0_500px] border-l border-[var(--color-border)] max-[899px]:fixed max-[899px]:inset-x-0 max-[899px]:top-[48px] max-[899px]:bottom-0 max-[899px]:z-[1000] max-[899px]:flex-none max-[899px]:border-l-0"
      class:hidden={!notificationsOpen}
    >
      <PluginFrame
        src="/plugins/notifications-ui/index.html"
        title="Notifications plugin"
        onMessage={handlePluginMessage}
      />
    </aside>
  </div>
</div>
