<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Badge, Button, Menu, MenuItem } from '@texture/ui';
  import NotificationsPanel from '../features/notifications/NotificationsPanel.svelte';
  import SettingsPage from '../features/settings/SettingsPage.svelte';
  import StorePage from '../features/store/StorePage.svelte';
  import LibraryPage from '../features/library/LibraryPage.svelte';
  import LibrariesPage from '../features/library/LibrariesPage.svelte';
  import AppInfoPage from '../features/settings/AppInfoPage.svelte';
  import NotesLibraryPage from '../features/notes-library/NotesLibraryPage.svelte';
  import { bookTitleOf } from '../features/notes-library/notes-library';
  import WorkplaceSurface from '../features/workplace/WorkplaceSurface.svelte';
  import WorkspacePickerDialog from '../features/workplace/WorkspacePickerDialog.svelte';
  import {
    closeTab,
    duplicateTab,
    openBook,
    replaceTabBook,
    updateTab,
    activateTab,
    activeTab,
  } from '../features/workplace/workplace';
  import {
    currentWorkspace,
    createWorkspace,
    removeWorkspace,
    renameWorkspace,
    selectWorkspace,
    serializeRegistry,
    updateCurrentWorkspaceTabs,
    type WorkspaceRegistry,
  } from '../features/workplace/workspace-registry';
  import type { ActiveLibrary } from '../features/lifecycle/bootstrap';
  import type { AppearanceBootstrap } from '../features/lifecycle/bootstrap';
  import type { SettingsBootstrap } from '../features/lifecycle/bootstrap';
  import type { NotificationsBootstrap } from '../features/lifecycle/bootstrap';
  import type { NotesLibraryBootstrap } from '../features/lifecycle/bootstrap';
  import type { StoreBootstrap } from '../features/lifecycle/bootstrap';
  import {
    allowedNoteTypes,
    bookKey,
    listAllSets,
    type Note,
    type NoteSet,
    type NoteType,
  } from '../features/notes/notes';
  import { createNotesController } from '../features/notes/notes-controller.svelte';
  import { formatFromPath, isSupportedFormat } from '../features/reader/reader';
  import { invokeCommand, listenEvent, openDialog } from '../shared/app-bridge';
  import { activeLibrary as fetchActiveLibrary } from '../shared/base-plugin';
  import { lastSegment } from '../shared/path';
  import {
    APP_SETTINGS_SECTION,
    applyAppPalette,
    applyAppThemeTracked,
    paletteFromSettingsEvent,
    THEME_SETTING_KEY,
    themeFromSettingsEvent,
  } from '../features/appearance/theme';
  import { saveSettingsValues } from '../features/settings/settings';
  import { normalizeThemePreference, type ThemePreference } from '@texture/ui';

  interface Props {
    /** Реестр рабочих мест, загруженный до первого рендера. */
    initialRegistry: WorkspaceRegistry;
    /** Активная библиотека, загруженная до первого рендера. */
    initialLibrary: ActiveLibrary | null;
    /** Оформление, применённое до первого рендера. */
    initialAppearance: AppearanceBootstrap;
    /** Декларации настроек, загруженные до первого рендера. */
    initialSettings: SettingsBootstrap;
    /** Журнал уведомлений, загруженный до первого рендера. */
    initialNotifications: NotificationsBootstrap;
    /** Каталог плагинов и сторов, загруженный до первого рендера. */
    initialStore: StoreBootstrap;
    /** Реестр наборов заметок, загруженный до первого рендера. */
    initialNotesLibrary: NotesLibraryBootstrap;
  }

  let {
    initialRegistry,
    initialLibrary,
    initialAppearance,
    initialSettings,
    initialNotifications,
    initialStore,
    initialNotesLibrary,
  }: Props = $props();

  /** Страница раздела настроек. */
  type SettingsSection = 'general' | 'plugins' | 'about';

  /** Открыт ли раздел настроек; состояние принадлежит оболочке. */
  let settingsOpen = $state(false);

  /** Выбранная страница раздела настроек. */
  let settingsSection = $state<SettingsSection>('general');

  /** Открыта ли страница «Библиотеки»; состояние принадлежит оболочке. */
  let librariesOpen = $state(false);

  /** Открыт ли раздел «Заметки»; состояние принадлежит оболочке. */
  let notesLibraryOpen = $state(false);

  /** Реестр наборов заметок всех книг (агрегат `list_all_sets`). */
  let notesLibrarySets: NoteSet[] = $state(untrack(() => initialNotesLibrary.sets));

  /** Ошибка загрузки реестра заметок для сообщения в разделе. */
  let notesLibraryError: string = $state(untrack(() => initialNotesLibrary.error));

  /** Идёт ли загрузка реестра заметок. */
  let notesLibraryLoading = $state(false);

  /** Номер последнего запроса реестра: ответы устаревших запросов отбрасываются. */
  let notesLibraryLoadToken = 0;

  /** Отложенный переход из реестра: книга открывается асинхронно. */
  let pendingNoteTarget: { bookKey: string; setId: string; noteId: string | null } | null =
    $state(null);

  /** Открыта ли панель уведомлений; состояние принадлежит оболочке. */
  let notificationsOpen = $state(false);

  /** Число непрочитанных уведомлений, полученное от поверхности уведомлений. */
  let unreadCount = $state(
    untrack(
      () => initialNotifications.entries.filter((entry) => entry.level === 'User' && !entry.read).length,
    ),
  );

  /** Есть ли неприменённые изменения активности плагинов. */
  let activationPending = $state(untrack(() => initialStore.activationPending));

  /** Активная библиотека для шапки. */
  let activeLibrary: ActiveLibrary | null = $state(untrack(() => initialLibrary));

  /** Открыта ли поверхность рабочего места; принадлежит оболочке. */
  let workspaceOpen = $state(true);

  /** Показывается ли список рабочих мест вместо вкладок; точка входа приложения. */
  let workspaceListMode = $state(true);

  /** Открыт ли диалог выбора рабочего места при открытии книги. */
  let pickerOpen = $state(false);

  /** Книга, ожидающая выбора рабочего места при открытии из библиотеки. */
  let pendingBook: { path: string; title: string; format: string } | null = null;

  /** Открыта ли панель списка открытых книг. */
  let booksPanelOpen = $state(false);

  /** Открыта ли панель заметок. */
  let notesPanelOpen = $state(false);

  /** Выбранная в списке заметка (для подсветки и после клика по подсветке). */
  let selectedNoteId: string | null = $state(null);

  /** Номер внешнего изменения заметок из события хранилища (перечитывание реестра). */
  let notesRevision = $state(0);

  /** Предпочтение темы для кнопки-переключателя в шапке. */
  let themePreference = $state<ThemePreference>(
    untrack(() => normalizeThemePreference(initialAppearance.theme)),
  );

  /** Ошибка смены темы из шапки. */
  let appearanceError = $state<string | null>(null);

  /** Порядок цикла темы кнопкой в шапке. */
  const THEME_CYCLE: readonly ThemePreference[] = ['light', 'dark', 'system'];

  /** Названия тем по значению предпочтения. */
  const themeTitles: Record<ThemePreference, string> = {
    light: 'Светлая',
    dark: 'Тёмная',
    system: 'Как в системе',
  };

  /** Читалка активной вкладки для перехода к заметке. */
  let reader: { goto: (note: Note) => void } | undefined = $state();

  /** Реестр рабочих мест и активное место (загружен до первого рендера). */
  let registry: WorkspaceRegistry = $state(untrack(() => initialRegistry));

  /** Текущее (открытое) рабочее место. */
  const workspace = $derived(currentWorkspace(registry));

  /** Активная вкладка текущего рабочего места. */
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

  /** Доступные типы заметок активной книги: текучий формат — только цитата.
   *
   * Встроенное текстовое чтение (EPUB, позже FB2) — текучее: поток текста
   * перестраивается, поэтому точки и фигуры неустойчивы, и доступна только
   * цитата. Страничные форматы (плагин рабочего места, PDF) — все три типа.
   */
  const currentNoteTypes: readonly NoteType[] = $derived.by(() => {
    const tab = currentTab;
    const format = tab ? formatFromPath(tab.path) : '';
    return allowedNoteTypes(!isSupportedFormat(format));
  });

  /** Контроллер заметок активной книги: состояние набора и операции хранилища. */
  const notesController = createNotesController(
    () => notesBookKey,
    () => currentNoteTypes,
    () => currentTab?.title ?? '',
  );

  /** Вкладка, для которой выбирается новая книга (переуказание файла). */
  let repointTabId: string | null = $state(null);

  /** Имя активной библиотеки по последнему сегменту пути. */
  function libraryName(): string | null {
    const library = activeLibrary;
    if (!library?.path) {
      return null;
    }
    return lastSegment(library.path);
  }

  /** Показан ли основной раздел библиотеки. */
  function isMainSection(): boolean {
    return !settingsOpen && !librariesOpen && !notesLibraryOpen && !workspaceOpen;
  }

  /** Видна ли поверхность рабочего места (с учётом модальных разделов). */
  const workspaceVisible = $derived(workspaceOpen && !settingsOpen && !librariesOpen && !notesLibraryOpen);

  /** Видна ли страница «Библиотеки» (с учётом модального раздела настроек). */
  const librariesVisible = $derived(librariesOpen && !settingsOpen && !notesLibraryOpen);

  /** Виден ли раздел «Заметки» (с учётом модальных разделов). */
  const notesLibraryVisible = $derived(notesLibraryOpen && !settingsOpen && !librariesOpen);

  /** Показывать ли в шапке имя активной библиотеки.
   *
   * В открытом рабочем месте имя и провайдер библиотеки не показываются: шапка
   * отображает только имя самого рабочего места. В списке рабочих мест имя
   * библиотеки остаётся.
   */
  function showLibrary(): boolean {
    return (
      activeLibrary !== null &&
      !settingsOpen &&
      (isMainSection() || (workspaceOpen && activeWorkspaceName === null))
    );
  }

  /** Название текущего раздела в верхней панели. */
  const sectionTitle = $derived(
    settingsOpen
      ? settingsSection === 'plugins'
        ? 'Плагины'
        : settingsSection === 'about'
          ? 'Информация'
          : 'Настройки'
      : librariesOpen
        ? 'Библиотеки'
        : notesLibraryOpen
          ? 'Заметки'
          : workspaceOpen
            ? 'Рабочие места'
            : 'Библиотека',
  );

  /** Имя открытого рабочего места для шапки; null в списке рабочих мест. */
  const activeWorkspaceName = $derived(
    workspaceOpen && !workspaceListMode && workspace ? workspace.name : null,
  );

  /** Показывать ли в шапке название раздела помимо имени библиотеки. */
  function showSectionLabel(): boolean {
    return !(isMainSection() && activeLibrary !== null);
  }

  /** Переключение раздела настроек как модального окна.
   *
   * Настройки не меняют базовую поверхность: при закрытии пользователь
   * возвращается туда, откуда открыл их.
   */
  function toggleSettings() {
    settingsOpen = !settingsOpen;
  }

  /** Переключение страницы «Библиотеки». */
  function toggleLibraries() {
    librariesOpen = !librariesOpen;
    if (librariesOpen) {
      settingsOpen = false;
      notesLibraryOpen = false;
    }
  }

  /** Переключение раздела «Заметки».
   *
   * Данные реестра загружены на бутстрапе и обновляются по событию
   * `notes:changed`, поэтому открытие раздела не делает запрос и не показывает
   * промежуточный пустой кадр.
   */
  function toggleNotesLibrary() {
    notesLibraryOpen = !notesLibraryOpen;
    if (notesLibraryOpen) {
      settingsOpen = false;
      librariesOpen = false;
    }
  }

  /** Загрузка реестра наборов заметок всех книг. */
  async function loadNotesLibrary() {
    const token = ++notesLibraryLoadToken;
    notesLibraryLoading = notesLibrarySets.length === 0;
    try {
      const sets = await listAllSets();
      if (token !== notesLibraryLoadToken) {
        return;
      }
      notesLibrarySets = sets;
      notesLibraryError = '';
    } catch (error) {
      if (token !== notesLibraryLoadToken) {
        return;
      }
      notesLibraryError = String(error);
    } finally {
      if (token === notesLibraryLoadToken) {
        notesLibraryLoading = false;
      }
    }
  }

  /** Переключение поверхности рабочего места.
   *
   * При открытии из другого раздела показывается **список** рабочих мест —
   * точка входа раздела, а не конкретное рабочее место.
   */
  function toggleWorkspace() {
    const wasActive = workspaceVisible;
    settingsOpen = false;
    librariesOpen = false;
    notesLibraryOpen = false;
    if (wasActive) {
      workspaceOpen = false;
    } else {
      workspaceOpen = true;
      workspaceListMode = true;
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

  /** Сохранение оформления в секции настроек приложения.
   *
   * Изменение применяется сразу (кнопка реагирует мгновенно), а сохранение идёт
   * асинхронно; событие `settings:changed` подтверждает записанное значение.
   */
  async function saveAppearance(values: Record<string, unknown>) {
    try {
      await saveSettingsValues(APP_SETTINGS_SECTION, values);
      appearanceError = null;
    } catch (error) {
      appearanceError = String(error);
    }
  }

  /** Циклическое переключение темы кнопкой в шапке: светлая → тёмная → система. */
  function cycleTheme() {
    const index = THEME_CYCLE.indexOf(themePreference);
    const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
    themePreference = next;
    applyAppThemeTracked(next);
    void saveAppearance({ [THEME_SETTING_KEY]: next });
  }

  /** Выбор активной вкладки. */
  function selectTab(id: string) {
    registry = updateCurrentWorkspaceTabs(registry, (state) => activateTab(state, id));
  }

  /** Закрытие вкладки. */
  function removeTab(id: string) {
    registry = updateCurrentWorkspaceTabs(registry, (state) => closeTab(state, id));
  }

  /** Дублирование вкладки. */
  function duplicateCurrentTab(id: string) {
    registry = updateCurrentWorkspaceTabs(registry, (state) => duplicateTab(state, id));
  }

  /** Изменение состояния чтения вкладки. */
  function handleTabState(id: string, state: { zoom: number; position: number }) {
    registry = updateCurrentWorkspaceTabs(registry, (current) => updateTab(current, id, state));
  }

  /** Переключение панели списка открытых книг. */
  function toggleBooksPanel() {
    booksPanelOpen = !booksPanelOpen;
  }

  /** Переключение панели заметок. */
  function toggleNotesPanel() {
    notesPanelOpen = !notesPanelOpen;
    if (notesPanelOpen) {
      void notesController.load();
    }
  }

  /** Переход чтения к заметке в тексте книги. */
  function goToNote(note: Note) {
    selectedNoteId = note.id;
    reader?.goto(note);
  }

  /** Клик по подсветке заметки в книге: панель открывается, заметка выбирается. */
  function selectNote(noteId: string) {
    selectedNoteId = noteId;
    notesPanelOpen = true;
    // Инструмент следует за выбранной заметкой: дальнейшее перемещение и
    // создание новых заметок идут её типом и цветом (см. activateNoteTool).
    notesController.activateTool(noteId);
    void notesController.load();
  }


  /** Перечитывание реестра заметок при внешнем изменении хранилища.
   *
   * Реестр заметок перечитывается всегда (а не только когда открыт раздел),
   * чтобы «Заметки» показывали актуальное состояние без перезапуска и без
   * запроса при открытии. Вызов не отслеживается: иначе запись реестра
   * перезапустила бы этот же эффект. Заметки активной книги перечитывает
   * контроллер по своему событию (`markChanged`).
   */
  $effect(() => {
    const marker = notesRevision;
    if (marker === 0) {
      return;
    }
    untrack(() => {
      void loadNotesLibrary();
    });
  });

  /** Потребление отложенного перехода к заметке после появления вкладки.
   *
   * Цель ждёт, пока книга станет активной, набор — загруженным, а читалка —
   * доступной, и только затем делает заметку выбранной и переводит к ней чтение.
   */
  $effect(() => {
    const target = pendingNoteTarget;
    if (!target) {
      return;
    }
    if (notesBookKey !== target.bookKey) {
      return;
    }
    if (notesController.setId !== target.setId) {
      return;
    }
    if (!target.noteId) {
      pendingNoteTarget = null;
      notesPanelOpen = true;
      return;
    }
    const note = notesController.findNote(target.noteId);
    if (!note) {
      return;
    }
    pendingNoteTarget = null;
    notesPanelOpen = true;
    goToNote(note);
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
    if (registry.currentWorkspaceId === null) {
      workspaceListMode = true;
    }
  }

  /** Переход к библиотеке для добавления книги в текущее рабочее место. */
  function requestAddBook() {
    workspaceOpen = false;
    librariesOpen = false;
    settingsOpen = false;
    notesLibraryOpen = false;
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

  /** Размещение книги: переуказание вкладки, текущее место или выбор места.
   *
   * Переуказание заменяет книгу вкладки; иначе книга открывается вкладкой в
   * текущем рабочем месте, а при его отсутствии откладывается до выбора места.
   * Возвращает, открылась ли книга сразу (без диалога выбора).
   */
  function placeBook(book: { path: string; title: string; format: string }): boolean {
    if (repointTabId) {
      registry = updateCurrentWorkspaceTabs(registry, (state) =>
        replaceTabBook(state, repointTabId as string, book),
      );
      repointTabId = null;
      return true;
    }
    if (registry.currentWorkspaceId !== null) {
      registry = updateCurrentWorkspaceTabs(registry, (state) => openBook(state, book));
      return true;
    }
    // Текущего места нет: книга ждёт выбора или создания рабочего места.
    pendingBook = book;
    pickerOpen = true;
    return false;
  }

  /** Показ поверхности рабочего места после открытия книги. */
  function showWorkspaceSurface() {
    workspaceOpen = true;
    workspaceListMode = false;
    settingsOpen = false;
    librariesOpen = false;
    notesLibraryOpen = false;
  }

  /** Открытие выбранной с диска книги вкладкой или переуказание файла вкладки. */
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
    if (placeBook(book)) {
      showWorkspaceSurface();
    }
  }

  /** Человекочитаемое имя книги по последнему сегменту пути. */
  function fileName(path: string): string {
    return lastSegment(path, { stripExt: true });
  }

  /** Открытие книги вкладкой рабочего места из библиотеки.
   *
   * Место выбирается явно: если рабочее место уже открыто, книга идёт в него;
   * иначе показывается диалог выбора места.
   */
  function openBookInWorkspace(value: { path: string; title: string; format: string }) {
    if (!value.path) {
      return;
    }
    const book = {
      path: value.path,
      title: value.title || fileName(value.path),
      format: value.format || formatFromPath(value.path),
    };
    if (placeBook(book)) {
      showWorkspaceSurface();
    }
  }

  /** Переход из реестра заметок к книге набора.
   *
   * Книга открывается вкладкой в рабочем месте, набор становится активным, а
   * переход к конкретной заметке запоминается как отложенная цель: вкладка
   * появляется асинхронно, поэтому `reader.goto` вызывается, когда заметки книги
   * уже загружены.
   */
  function openNotesLibrarySet(set: NoteSet) {
    openNotesTarget(set, null);
  }

  /** Переход из реестра заметок к конкретной заметке набора. */
  function openNotesLibraryNote(set: NoteSet, note: Note) {
    openNotesTarget(set, note.id);
  }

  /** Общий переход из реестра: книга, активный набор и цель по заметке. */
  function openNotesTarget(set: NoteSet, noteId: string | null) {
    const key = set.bookKey.trim();
    if (!key || key === 'no-library') {
      notesLibraryError = 'Книга набора недоступна: у набора нет файла.';
      return;
    }
    // Активный набор запоминается до загрузки заметок: `load` выберет его,
    // когда вкладка книги появится.
    notesController.rememberActiveSet(key, set.id);
    pendingNoteTarget = { bookKey: key, setId: set.id, noteId };
    notesLibraryOpen = false;
    const book = {
      path: key,
      title: bookTitleOf(set),
      format: formatFromPath(key),
    };
    if (placeBook(book)) {
      showWorkspaceSurface();
    }
  }

  /** Выбор рабочего места из диалога: книга открывается вкладкой в нём. */
  function pickWorkspace(id: string) {
    registry = selectWorkspace(registry, id);
    pickerOpen = false;
    if (pendingBook) {
      registry = updateCurrentWorkspaceTabs(registry, (state) => openBook(state, pendingBook as {
        path: string;
        title: string;
        format: string;
      }));
      pendingBook = null;
    }
    showWorkspaceSurface();
  }

  /** Создание рабочего места из диалога выбора: становится текущим, книга — в нём. */
  function createWorkspaceAndOpen(name: string) {
    registry = createWorkspace(registry, name);
    pickerOpen = false;
    if (pendingBook) {
      const book = pendingBook;
      pendingBook = null;
      registry = updateCurrentWorkspaceTabs(registry, (state) => openBook(state, book));
    }
    showWorkspaceSurface();
  }

  /** Закрытие диалога выбора без открытия книги. */
  function closeWorkspacePicker() {
    pickerOpen = false;
    pendingBook = null;
  }

  /** Обновление сведений об активной библиотеке из ядра. */
  async function refreshActiveLibrary() {
    try {
      const result = await fetchActiveLibrary();
      activeLibrary = (result as ActiveLibrary | null) ?? null;
    } catch {
      activeLibrary = null;
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    let unlistenNotes: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;
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
        notesController.markChanged();
      });
      unlistenSettings = await listenEvent('settings:changed', (value) => {
        const theme = themeFromSettingsEvent(value);
        if (theme !== null) {
          themePreference = theme;
          applyAppThemeTracked(theme);
        }
        // Палитра меняется в настройках; здесь достаточно применить её.
        const nextPalette = paletteFromSettingsEvent(value);
        if (nextPalette !== null) {
          applyAppPalette(nextPalette);
        }
      });
    })();
    return () => {
      unlisten?.();
      unlistenNotes?.();
      unlistenSettings?.();
    };
  });

  /** Сообщение об ошибке загрузки или сохранения реестра. */
  let registryError = $state<string | null>(null);

  /** Сохранение реестра рабочих мест с небольшой задержкой.
   *
   * Глубокий снимок берётся лениво — уже в момент сохранения, а не на каждое
   * изменение реестра: до истечения задержки сериализовать нечего.
   */
  $effect(() => {
    // Подписка на изменения реестра; сам снимок берётся отложенно.
    void registry;
    const timer = setTimeout(() => {
      void saveRegistry($state.snapshot(registry));
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
    class="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2"
  >
    <span class="text-base font-bold text-[var(--primary)]">Текстура</span>
    {#if showLibrary()}
      {#if activeLibrary?.provider_name}
        <Badge>{activeLibrary.provider_name}</Badge>
      {/if}
      <span
        class="max-w-[280px] truncate text-sm text-[var(--muted-foreground)]"
        title={activeLibrary?.path ?? ''}
      >
        {libraryName()}
      </span>
    {/if}
    {#if showSectionLabel()}
      {#if activeWorkspaceName}
        <span
          class="max-w-[280px] truncate text-sm font-semibold text-[var(--foreground)]"
          data-testid="header-workspace-name"
          title={activeWorkspaceName}
        >
          {activeWorkspaceName}
        </span>
      {:else}
        <span class="text-sm text-[var(--muted-foreground)]" data-testid="section-title"
          >{sectionTitle}</span
        >
      {/if}
    {/if}
    <div class="ml-auto flex items-center gap-2">
      {#if registryError}
        <span
          class="whitespace-nowrap rounded-md border border-[var(--destructive)] px-2 py-[2px] text-[12px] text-[var(--destructive)]"
          title={registryError}
        >
          Не удалось сохранить рабочее место
        </span>
      {/if}
      {#if notesController.error}
        <span
          class="whitespace-nowrap rounded-md border border-[var(--destructive)] px-2 py-[2px] text-[12px] text-[var(--destructive)]"
          title={notesController.error}
        >
          Ошибка заметок
        </span>
      {/if}
      {#if appearanceError}
        <span
          class="whitespace-nowrap rounded-md border border-[var(--destructive)] px-2 py-[2px] text-[12px] text-[var(--destructive)]"
          title={appearanceError}
        >
          Ошибка оформления
        </span>
      {/if}
      {#if activationPending}
        <span
          class="whitespace-nowrap rounded-md border border-[var(--warning)] px-2 py-[2px] text-[12px] text-[var(--warning)]"
          title="Изменения плагинов применятся после перезапуска приложения или переоткрытия библиотеки"
        >
          Нужен перезапуск
        </span>
      {/if}
      <Button
        variant={workspaceVisible ? 'primary' : 'secondary'}
        size="icon"
        title="Рабочее место"
        ariaLabel="Рабочее место"
        ariaPressed={workspaceVisible}
        onclick={toggleWorkspace}
      >
        <svg viewBox="0 0 24 24" width="1.125em" height="1.125em" aria-hidden="true">
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
        variant={librariesVisible ? 'primary' : 'secondary'}
        size="icon"
        title="Библиотеки"
        ariaLabel="Библиотеки"
        ariaPressed={librariesVisible}
        onclick={toggleLibraries}
      >
        <svg viewBox="0 0 24 24" width="1.125em" height="1.125em" aria-hidden="true">
          <rect x="4" y="3.5" width="4.5" height="17" rx="1" fill="currentColor" />
          <rect x="10" y="3.5" width="4.5" height="17" rx="1" fill="currentColor" />
          <path
            d="M16.2 4.3a1 1 0 0 1 1.25.7l3.1 14.2a1 1 0 0 1-.75 1.2l-1.9.45a1 1 0 0 1-1.2-.75L13.6 5.9a1 1 0 0 1 .75-1.2Z"
            fill="currentColor"
          />
        </svg>
      </Button>
      <Button
        variant={notesLibraryVisible ? 'primary' : 'secondary'}
        size="icon"
        title="Реестр заметок"
        ariaLabel="Реестр заметок"
        ariaPressed={notesLibraryVisible}
        onclick={toggleNotesLibrary}
      >
        <svg viewBox="0 0 24 24" width="1.125em" height="1.125em" aria-hidden="true">
          <path
            d="M6 3.5h9.5L19.5 7v13.5a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path d="M15 3.5V7h3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          <path
            d="M8.5 12h7M8.5 15.5h7"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </Button>
      <span class="mx-1 h-6 w-px shrink-0 bg-[var(--border)]" aria-hidden="true"></span>
      <Button
        variant={notificationsOpen ? 'primary' : 'secondary'}
        size="icon"
        title="Уведомления"
        ariaLabel="Уведомления"
        ariaPressed={notificationsOpen}
        class="relative"
        onclick={toggleNotifications}
      >
        <svg viewBox="0 0 24 24" width="1.125em" height="1.125em" aria-hidden="true">
          <path
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-5v-1l-1.7-1.7V10a5.3 5.3 0 0 0-4-5.2V4a1.3 1.3 0 0 0-2.6 0v.8A5.3 5.3 0 0 0 6.7 10v4.3L5 16v1Z"
            fill="currentColor"
          />
        </svg>
        <span
          class="absolute -top-[0.35rem] -right-[0.35rem] flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full px-[0.3rem] text-[0.7rem] font-bold text-[var(--primary-foreground)]"
          style:background={unreadCount === 0
            ? 'var(--input)'
            : 'var(--success)'}
        >
          {unreadCount}
        </span>
      </Button>
      <Button
        variant="secondary"
        size="icon"
        title={`Тема: ${themeTitles[themePreference]} (нажмите, чтобы переключить)`}
        ariaLabel="Переключить тему"
        onclick={cycleTheme}
      >
        <svg viewBox="0 0 24 24" width="1.125em" height="1.125em" aria-hidden="true">
          {#if themePreference === 'light'}
            <circle cx="12" cy="12" r="4.5" fill="currentColor" />
            <path
              d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              fill="none"
            />
          {:else if themePreference === 'dark'}
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
          {:else}
            <rect
              x="2.5"
              y="4"
              width="19"
              height="13"
              rx="2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <path d="M8 20.5h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          {/if}
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
        <svg viewBox="0 0 24 24" width="1.125em" height="1.125em" aria-hidden="true">
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

  <div class="relative flex min-h-0 flex-1 overflow-hidden">
    <main class="flex min-w-0 flex-1">
      <div
        class="min-h-0 min-w-0 flex-1"
        class:hidden={settingsOpen || librariesOpen || notesLibraryOpen || workspaceOpen}
      >
        <LibraryPage
          initialActiveLibrary={activeLibrary}
          targetWorkspaceName={workspace?.name ?? null}
          onOpenInWorkplace={openBookInWorkspace}
        />
      </div>
      {#if notesLibraryVisible}
        <div class="flex min-h-0 min-w-0 flex-1">
          <NotesLibraryPage
            sets={notesLibrarySets}
            loading={notesLibraryLoading}
            error={notesLibraryError}
            onOpenSet={openNotesLibrarySet}
            onOpenNote={openNotesLibraryNote}
          />
        </div>
      {/if}
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!workspaceVisible}>
        <WorkplaceSurface
          bind:this={reader}
          workspace={workspace}
          workspaces={registry.workspaces}
          currentWorkspaceId={registry.currentWorkspaceId}
          listMode={workspaceListMode}
          booksOpen={booksPanelOpen}
          notesOpen={notesPanelOpen}
          notes={notesController.items}
          noteSets={notesController.sets}
          activeSetId={notesController.setId}
          notesLoading={notesController.loading}
          hasBook={notesBookKey !== null}
          visible={workspaceVisible}
          selectedNoteId={selectedNoteId}
          tool={notesController.tool}
          allowedNoteTypes={currentNoteTypes}
          onToolChange={notesController.setTool}
          onSelectTab={selectTab}
          onCloseTab={removeTab}
          onDuplicateTab={duplicateCurrentTab}
          onAddBook={requestAddBook}
          onAddFile={chooseBookFile}
          onToggleBooks={toggleBooksPanel}
          onToggleNotes={toggleNotesPanel}
          onQuote={notesController.addQuote}
          onTextNote={notesController.addTextNote}
          onShape={notesController.addShape}
          onPlaceNote={notesController.place}
          onDeleteNote={notesController.remove}
          onChangeNoteColor={notesController.recolor}
          onEditNote={notesController.editDetails}
          onGoToNote={goToNote}
          onSelectNote={selectNote}
          onSelectSet={notesController.selectSet}
          onCreateSet={notesController.createSet}
          onRenameSet={notesController.renameSet}
          onRemoveSet={notesController.removeSet}
          onTabState={handleTabState}
          onRepointTab={requestRepoint}
          onBackToList={backToList}
          onCreateWorkspace={createNewWorkspace}
          onOpenWorkspace={openWorkspace}
          onRenameWorkspace={renameExistingWorkspace}
          onRemoveWorkspace={removeExistingWorkspace}
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!librariesVisible}>
        <LibrariesPage
          onOpened={() => {
            librariesOpen = false;
            workspaceOpen = false;
            settingsOpen = false;
          }}
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!settingsOpen}>
        <Menu
          ariaLabel="Разделы настроек"
          class="flex-[0_0_200px] border-r border-[var(--border)] bg-[var(--background)] p-3"
        >
          <MenuItem active={settingsSection === 'general'} onclick={() => selectSettingsSection('general')}>
            Настройки
          </MenuItem>
          <MenuItem active={settingsSection === 'plugins'} onclick={() => selectSettingsSection('plugins')}>
            Плагины
          </MenuItem>
          <MenuItem active={settingsSection === 'about'} onclick={() => selectSettingsSection('about')}>
            Информация
          </MenuItem>
        </Menu>
        <div class="flex min-h-0 min-w-0 flex-1">
          <div class="min-h-0 min-w-0 flex-1" class:hidden={settingsSection !== 'general'}>
            <SettingsPage
              initialDeclarations={initialSettings.declarations}
              initialError={initialSettings.error}
            />
          </div>
          <div class="min-h-0 min-w-0 flex-1" class:hidden={settingsSection !== 'plugins'}>
            <StorePage
              initialPlugins={initialStore.plugins}
              initialStores={initialStore.stores}
              initialPending={initialStore.activationPending}
              initialError={initialStore.error}
              onPendingChange={(pending) => (activationPending = pending)}
            />
          </div>
          <div class="min-h-0 min-w-0 flex-1" class:hidden={settingsSection !== 'about'}>
            {#if settingsSection === 'about'}
              <AppInfoPage />
            {/if}
          </div>
        </div>
      </div>
    </main>
    <aside
      class="flex w-[var(--notifications-panel-width)] min-w-0 flex-none border-l border-[var(--border)] max-[899px]:absolute max-[899px]:inset-0 max-[899px]:w-auto max-[899px]:border-l-0"
      class:hidden={!notificationsOpen}
    >
      <NotificationsPanel
        initialEntries={initialNotifications.entries}
        initialTechnicalVisible={initialNotifications.technicalVisible}
        initialError={initialNotifications.error}
        onUnreadChange={(count) => (unreadCount = count)}
      />
    </aside>
  </div>

  <WorkspacePickerDialog
    open={pickerOpen}
    workspaces={registry.workspaces}
    onSelect={pickWorkspace}
    onCreate={createWorkspaceAndOpen}
    onOpenChange={(value) => {
      if (!value) {
        closeWorkspacePicker();
      }
    }}
  />
</div>
