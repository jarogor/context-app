<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button, Icon, Menu, MenuItem } from '@context/ui';
  import AppBar from './AppBar.svelte';
  import SectionNav from './SectionNav.svelte';
  import NotificationsPanel from '../features/notifications/NotificationsPanel.svelte';
  import SettingsPage from '../features/settings/SettingsPage.svelte';
  import StorePage from '../features/store/StorePage.svelte';
  import LibraryPage from '../features/library/LibraryPage.svelte';
  import LibrariesPage from '../features/library/LibrariesPage.svelte';
  import NotesLibraryPage from '../features/notes-library/NotesLibraryPage.svelte';
  import UpdateDialog from '../features/update/UpdateDialog.svelte';
  import {
    applyCoreUpdate,
    checkCoreUpdate,
    quitForCoreUpdate,
    restartApplication,
    skipCoreUpdate,
    type AvailableCore,
    type UpdateBootstrap,
  } from '../features/update/update';
  import {
    listPluginUpdates,
    updatePluginFromStore,
    type PluginUpdate,
  } from '../features/store/plugin-store';
  import { bookTitleOf } from '../features/notes-library/notes-library';
  import WorkplaceArea from '../features/workplace/WorkplaceArea.svelte';
  import WorkspacePickerDialog from '../features/workplace/WorkspacePickerDialog.svelte';
  import {
    applyTabAppearance,
    closeTab,
    duplicateTab,
    openBook,
    replaceTabBook,
    updateTab,
    activateTab,
    activeTab,
    type TabAppearancePatch,
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
  import { normalizeOpenTabsLimit } from '../features/workplace/workplace';
  import { openTabsLimitFromSettingsEvent } from '../features/workplace/open-tabs-limit';
  import { invokeCommand, listenEvent, openDialog } from '../shared/app-bridge';
  import { hotkeys } from '../features/hotkeys';
  import { dismissTopLayer } from '../features/hotkeys/dismiss-layer';
  import { NARROW_MAX_WIDTH } from '../shared/breakpoints';
  import { activeLibrary as fetchActiveLibrary } from '../shared/base-plugin';
  import { lastSegment } from '../shared/path';
  import {
    APP_SETTINGS_SECTION,
    applyAppPalette,
    applyAppReaderFont,
    applyAppReaderTheme,
    applyAppThemeTracked,
    paletteFromSettingsEvent,
    persistBootAppearance,
    READER_FONT_SETTING_KEY,
    READER_THEME_SETTING_KEY,
    readerFontFromSettingsEvent,
    readerThemeFromSettingsEvent,
    THEME_SETTING_KEY,
    themeFromSettingsEvent,
  } from '../features/appearance/theme';
  import { saveSettingsValues } from '../features/settings/settings';
  import { applyAppLocale, localeFromSettingsEvent } from '../features/appearance/locale';
  import { currentLocale, t } from '@context/i18n';
  import {
    DEFAULT_PALETTE,
    DEFAULT_READER_FONT,
    DEFAULT_READER_THEME,
    normalizePaletteId,
    normalizeReaderFontId,
    normalizeReaderThemeId,
    normalizeThemePreference,
    oppositeTheme,
    resolveTheme,
    type PaletteId,
    type ReaderFontId,
    type ReaderThemeId,
    type ResolvedTheme,
    type ThemePreference,
  } from '@context/ui';

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
    /** Лимит открытых вкладок рабочего места, загруженный до первого рендера. */
    initialOpenTabsLimit: number;
    /** Состояние обновлений, загруженное до первого рендера. */
    initialUpdate?: UpdateBootstrap;
  }

  let {
    initialRegistry,
    initialLibrary,
    initialAppearance,
    initialSettings,
    initialNotifications,
    initialStore,
    initialOpenTabsLimit,
    initialUpdate = { status: null, error: '' },
  }: Props = $props();

  /** Страница раздела настроек. */
  type SettingsSection = 'general' | 'system';

  /**
   * Секции раздела «Общие»: всё, что задаёт поведение приложения, кроме
   * технической диагностики. Технические секции собирает раздел «Система»
   * вместе с обновлениями и сведениями о приложении.
   */
  const GENERAL_SECTIONS = ['app.general', 'notifications.notifications'] as const;

  /** Открыт ли раздел настроек; состояние принадлежит оболочке. */
  let settingsOpen = $state(false);

  /** Выбранная страница раздела настроек. */
  let settingsSection = $state<SettingsSection>('general');

  /** Открыта ли страница «Библиотеки»; состояние принадлежит оболочке. */
  let librariesOpen = $state(false);

  /** Показан ли внутри раздела «Библиотека» вид выбора источников.
   *
   * Вид выбора источников показывается, когда библиотека ещё не открыта или
   * пользователь запросил его явно. После открытия библиотеки раздел сам
   * возвращается к списку книг.
   */
  let librarySourcesRequested = $state(false);

  /** Открыт ли раздел «Заметки»; состояние принадлежит оболочке. */
  let notesLibraryOpen = $state(false);

  /** Реестр наборов заметок всех книг (агрегат `list_all_sets`).
   *
   * Читается при открытии раздела, а не на стадии начальной загрузки: реестр
   * зависит от объёма пользовательских заметок и не должен задерживать первый
   * кадр.
   */
  let notesLibrarySets: NoteSet[] = $state([]);

  /** Ошибка загрузки реестра заметок для сообщения в разделе. */
  let notesLibraryError: string = $state('');

  /** Идёт ли загрузка реестра заметок; раздел показывает индикатор, а не пустоту. */
  let notesLibraryLoading = $state(false);

  /** Загружался ли реестр хотя бы раз: повторное открытие не читает его заново. */
  let notesLibraryLoaded = $state(false);

  /** Номер последнего запроса реестра: ответы устаревших запросов отбрасываются. */
  let notesLibraryLoadToken = 0;

  /** Отложенный переход из реестра: книга открывается асинхронно. */
  let pendingNoteTarget: { bookKey: string; setId: string; noteId: string | null } | null =
    $state(null);

  /** Открыта ли панель уведомлений; состояние принадлежит оболочке. */
  let notificationsOpen = $state(false);

  /** Узкое окно (телефон и планшет): меню разделов показывается иконками без
   * подписей. Точка совпадает с токеном `--breakpoint-narrow`. */
  let mobileWindow = $state(false);

  /** Число непрочитанных уведомлений, полученное от области уведомлений. */
  let unreadCount = $state(
    untrack(
      () => initialNotifications.entries.filter((entry) => entry.level === 'User' && !entry.read).length,
    ),
  );

  /** Есть ли неприменённые изменения активности плагинов. */
  let activationPending = $state(untrack(() => initialStore.activationPending));

  /** Открыт ли диалог доступных обновлений. */
  let updateDialogOpen = $state(false);

  /** Доступное обновление ядра. */
  let updateCore: AvailableCore | null = $state(null);

  /** Доступные обновления прикладных плагинов. */
  let updatePlugins: PluginUpdate[] = $state([]);

  /** Текущая версия приложения для показа в диалоге. */
  let updateCurrentVersion = $state(untrack(() => initialUpdate.status?.current_version ?? ''));

  /** Идёт ли установка обновлений. */
  let updateBusy = $state(false);

  /** Ошибка проверки или установки обновлений. */
  let updateError = $state('');

  /** Обновления установлены и ждут перезапуска. */
  let updateDone = $state(false);

  /** Было ли установлено обновление ядра: перезапуск выполняет помощник. */
  let updateCoreApplied = $state(false);

  /** Выполнена ли автоматическая проверка при запуске. */
  let updateStartupChecked = false;

  /** Активная библиотека для шапки. */
  let activeLibrary: ActiveLibrary | null = $state(untrack(() => initialLibrary));

  /** Виден ли вид выбора источников внутри раздела «Библиотека».
   *
   * Показывается, когда библиотека ещё не открыта или пользователь запросил его
   * явно; после открытия библиотеки раздел сам возвращается к списку книг.
   * Отдельный признак «библиотека открыта в этой сессии» нужен потому, что
   * сведения об активной библиотеке приходят асинхронно.
   */
  let libraryOpened = $state(false);

  const librarySourcesOpen = $derived(
    librarySourcesRequested || (activeLibrary === null && !libraryOpened),
  );

  /** Открыта ли область рабочего места; принадлежит оболочке. */
  let workspaceOpen = $state(true);

  /** Режим сосредоточенного чтения: хром интерфейса скрыт, книге — максимум места.
   *
   * Скрывает меню разделов, панель раздела и панели рабочего места; состояние
   * вкладок и чтения не меняется.
   */
  let focusMode = $state(false);

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

  /** Тема области чтения: общая настройка, независимая от темы интерфейса. */
  let readerTheme = $state<ReaderThemeId>(
    untrack(() => normalizeReaderThemeId(initialAppearance.readerTheme ?? DEFAULT_READER_THEME)),
  );

  /** Гарнитура книги: общая настройка, независимая от темы интерфейса. */
  let readerFont = $state<ReaderFontId>(
    untrack(() => normalizeReaderFontId(initialAppearance.readerFont ?? DEFAULT_READER_FONT)),
  );

  /** Лимит числа открытых вкладок рабочего места. */
  let openTabsLimit = $state(untrack(() => normalizeOpenTabsLimit(initialOpenTabsLimit)));

  /** Активная палитра оформления: общий реестр дизайн-системы. */
  let palette = $state<PaletteId>(
    untrack(() => normalizePaletteId(initialAppearance.palette ?? DEFAULT_PALETTE)),
  );

  /** Названия сторон темы для показа. */
  const themeTitles: Record<ResolvedTheme, string> = {
    get light() {
      return t('app.theme.light');
    },
    get dark() {
      return t('app.theme.dark');
    },
  };
  /** Тёмное предпочтение темы операционной системы.
   *
   * Нужно кнопке в шапке: при предпочтении «как в системе» интерфейс показывает
   * тему ОС, и нажатие должно поставить противоположную именно ей.
   */
  let systemPrefersDark = $state(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  /** Фактически показанная сторона темы: у «как в системе» — тема ОС. */
  const resolvedTheme: ResolvedTheme = $derived(resolveTheme(themePreference, systemPrefersDark));

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
   * Встроенное текстовое чтение (EPUB, FB2) — текучее: поток текста
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

  /** Ссылка на страницу библиотеки: уход в другой раздел сбрасывает открытую книгу. */
  let libraryPage: { resetBook: () => void } | undefined = $state();

  /** Видна ли область рабочего места (с учётом модальных разделов). */
  const workspaceVisible = $derived(workspaceOpen && !settingsOpen && !librariesOpen && !notesLibraryOpen);

  /** Показан ли список рабочих мест — точка входа раздела (с учётом модальных разделов).
   *
   * Кнопка-иконка рабочего места в шапке активна именно в этом состоянии: когда
   * показано конкретное место (его вкладки), кнопка обозначает не содержимое
   * раздела, а возврат к списку, и нажатой не выглядит.
   */
  const workspaceListVisible = $derived(workspaceVisible && workspaceListMode);

  /** Видна ли страница «Библиотеки» (с учётом модального раздела настроек). */
  const librariesVisible = $derived(librariesOpen && !settingsOpen && !notesLibraryOpen);

  /** Виден ли раздел «Заметки» (с учётом модальных разделов). */
  const notesLibraryVisible = $derived(notesLibraryOpen && !settingsOpen && !librariesOpen);

  /** Название текущего раздела в верхней панели. */
  const sectionTitle = $derived(
    settingsOpen
      ? settingsSection === 'system'
        ? t('app.settings.updates')
        : t('app.settings')
      : librariesOpen
        ? t('app.section.library')
        : notesLibraryOpen
          ? t('app.section.notes')
          : t('app.section.workspace'),
  );

  /**
   * Навигационный текст шапки: где находится пользователь и что выбрано.
   *
   * Раздел показывается сам по себе, а конкретный выбор — его именем: открытое
   * рабочее место или открытая библиотека (как «Рабочее место · имя»). Шапка —
   * единственное место, где это видно. Имя выборки отделяется от раздела, чтобы
   * шапка рисовала его начертанием, а не сливала с названием раздела.
   */
  const appContext = $derived.by(() => {
    if (workspaceVisible && !workspaceListMode && workspace) {
      return { section: sectionTitle, selection: workspace.name };
    }
    if (librariesVisible && activeLibrary?.path) {
      return { section: sectionTitle, selection: lastSegment(activeLibrary.path) };
    }
    return { section: sectionTitle, selection: null };
  });

  /** Название текущей страницы настроек для их шапки. */
  const settingsSectionTitle = $derived(
    settingsSection === 'system' ? t('app.settings.updates') : t('app.settings.general'),
  );

  /** Замечания, показываемые в шапке одним индикатором.
   *
   * Раньше каждое замечание рисовалось отдельной плашкой и при нескольких
   * ошибках разом выдавливало кнопки разделов. Теперь шапка держит один
   * индикатор, а полные тексты видны в его подсказке.
   */
  const headerAlerts = $derived.by(() => {
    const alerts: { text: string; warning: boolean }[] = [];
    if (registryError) {
      alerts.push({ text: t('app.error.workspace', { error: registryError }), warning: false });
    }
    if (notesController.error) {
      alerts.push({ text: t('app.error.notes', { error: notesController.error }), warning: false });
    }
    if (appearanceError) {
      alerts.push({ text: t('app.error.appearance', { error: appearanceError }), warning: false });
    }
    if (activationPending) {
      alerts.push({ text: t('app.error.pluginsRestart'), warning: true });
    }
    return alerts;
  });


  /** Переключение раздела настроек как модального окна.
   *
   * Настройки не меняют базовую область: при закрытии пользователь
   * возвращается туда, откуда открыл их.
   */
  function toggleSettings() {
    settingsOpen = !settingsOpen;
  }

  /** Закрытие полноэкранного раздела настроек.
   *
   * Базовая область не сбрасывается: закрытие возвращает пользователя к
   * той области, из которой настройки были открыты.
   */
  function closeSettings() {
    settingsOpen = false;
  }

  /** Закрытие верхнего слоя (действие `Escape`).
   *
   * Полноэкранные слои оболочки (настройки, уведомления) закрываются первыми:
   * они лежат выше всего рабочего места. Остальные слои — поиск, меню заметки,
   * правка — сообщают о себе стеку закрытия в порядке появления, поэтому
   * верхним закрывается именно последний открытый.
   */
  function dismissTop(): boolean {
    if (settingsOpen) {
      closeSettings();
      return true;
    }
    if (notificationsOpen) {
      notificationsOpen = false;
      return true;
    }
    return dismissTopLayer();
  }

  /** Переключение страницы «Библиотеки».
   *
   * Раздел всегда открывается **списком библиотек**: выбор библиотеки — точка
   * входа, а список книг открывается уже выбором конкретной библиотеки. Книги
   * открытой библиотеки не грузятся заново: уход со страницы книги сбрасывает её,
   * а каталог библиотеки остаётся загруженным в общем состоянии.
   */
  function toggleLibraries() {
    settingsOpen = false;
    notesLibraryOpen = false;
    librariesOpen = true;
    librarySourcesRequested = true;
    libraryPage?.resetBook();
  }

  /** Переключение вида выбора источников внутри раздела «Библиотека».
   *
   * Возврат к списку книг после выбора библиотеки; кнопки «Выбрать библиотеку»
   * внутри списка книг нет — за списком библиотек идём кнопкой раздела в шапке.
   */
  function toggleLibrarySources() {
    librarySourcesRequested = !librarySourcesOpen;
  }

  /** Переключение раздела «Заметки».
   *
   * Реестр читается при открытии раздела с показом индикатора: он зависит от
   * объёма пользовательских заметок, и на стадии начальной загрузки его не
   * читают. После первой загрузки реестр обновляется по событию `notes:changed`.
   * Раздел открывается сам, а не переключается: активная кнопка не «отжимается»
   * в другой раздел.
   */
  function toggleNotesLibrary() {
    settingsOpen = false;
    librariesOpen = false;
    notesLibraryOpen = true;
    void ensureNotesLibrary();
  }

  /** Загрузка реестра наборов заметок, если он ещё не читался.
   *
   * При ошибке реестр остаётся незагруженным, поэтому повторное открытие раздела
   * повторит попытку.
   */
  function ensureNotesLibrary() {
    if (notesLibraryLoaded || notesLibraryLoading) {
      return;
    }
    void loadNotesLibrary();
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
      notesLibraryLoaded = true;
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

  /** Переключение области рабочего места.
   *
   * При открытии из другого раздела показывается **список** рабочих мест —
   * точка входа раздела, а не конкретное рабочее место. Когда уже показано
   * конкретное место (его вкладки), нажатие возвращает к списку рабочих мест,
   * сохраняя состав и состояние вкладок открытого места. Когда список уже
   * показан, нажатие ничего не меняет: кнопка не «отжимается», а список рабочих
   * мест остаётся главной страницей приложения.
   */
  function toggleWorkspace() {
    settingsOpen = false;
    librariesOpen = false;
    notesLibraryOpen = false;
    if (workspaceListVisible) {
      // Список уже показан: кнопка обозначает главную страницу и не «отжимается».
      return;
    }
    workspaceOpen = true;
    workspaceListMode = true;
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

  /** Переключение темы кнопкой в шапке: на противоположную явную сторону.
   *
   * Третьего положения «как в системе» у кнопки нет: этот режим выбирают в
   * настройках, а нажатие всегда ставит противоположную сторону той, что сейчас
   * показана, — в том числе когда интерфейс следует теме ОС. Иначе очередное
   * нажатие возвращало бы системный режим и мешало простому переключению.
   */
  function toggleTheme() {
    const next = oppositeTheme(resolvedTheme);
    themePreference = next;
    applyAppThemeTracked(next);
    persistBootAppearance({ theme: next, palette });
    void saveAppearance({ [THEME_SETTING_KEY]: next });
  }

  /** Смена темы области чтения (переключатель в нижней панели читалки).
   *
   * Тема области чтения общая для приложения и применяется ко всем вкладкам
   * сразу. Как и тема интерфейса, она применяется немедленно, а сохранение идёт
   * асинхронно; событие `settings:changed` подтверждает значение.
   */
  function changeReaderTheme(theme: ReaderThemeId) {
    const next = normalizeReaderThemeId(theme);
    if (next === readerTheme) {
      return;
    }
    readerTheme = next;
    applyAppReaderTheme(next);
    void saveAppearance({ [READER_THEME_SETTING_KEY]: next });
  }

  /** Смена гарнитуры книги (переключатель «с засечками / без засечек»).
   *
   * Гарнитура общая для приложения и применяется ко всем вкладкам сразу: шрифт
   * выбирает читатель, а не книга, поэтому он не должен сбрасываться при
   * переключении вкладки.
   */
  function changeReaderFont(font: ReaderFontId) {
    const next = normalizeReaderFontId(font);
    if (next === readerFont) {
      return;
    }
    readerFont = next;
    applyAppReaderFont(next);
    void saveAppearance({ [READER_FONT_SETTING_KEY]: next });
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
    registry = updateCurrentWorkspaceTabs(registry, (state) => duplicateTab(state, id, openTabsLimit));
  }

  /** Изменение состояния чтения вкладки. */
  function handleTabState(id: string, state: { zoom: number; position: number }) {
    registry = updateCurrentWorkspaceTabs(registry, (current) => updateTab(current, id, state));
  }

  /** Правка оформления вкладки.
   *
   * Меняет только поля оформления (имя, описание, иконку, цвет): состав вкладок,
   * активная вкладка и состояние чтения не затрагиваются.
   */
  function editTabAppearance(id: string, patch: TabAppearancePatch) {
    registry = updateCurrentWorkspaceTabs(registry, (current) =>
      applyTabAppearance(current, id, patch),
    );
  }

  /** Переключение панели списка открытых книг.
   *
   * Панели заметок и открытых книг взаимоисключающие: они занимают одно и то же
   * место справа и вместе загромождают экран, поэтому открытие одной закрывает
   * другую.
   */
  function toggleBooksPanel() {
    booksPanelOpen = !booksPanelOpen;
    if (booksPanelOpen) {
      notesPanelOpen = false;
    }
  }

  /** Переключение панели заметок (взаимоисключающе с панелью открытых книг). */
  function toggleNotesPanel() {
    notesPanelOpen = !notesPanelOpen;
    if (notesPanelOpen) {
      booksPanelOpen = false;
      void notesController.load();
    }
  }

  /** Закрытие панели заметок без зависимости от текущего состояния.
   *
   * Используется автозакрытием при переходе к заметке из панели на узком окне.
   */
  function closeNotesPanel() {
    notesPanelOpen = false;
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
    booksPanelOpen = false;
    // Клик по заметке лишь выбирает её и открывает панель: активный инструмент
    // не переключается, чтобы создание заметок не зависело от прежнего выбора.
    void notesController.load();
  }


  /** Перечитывание реестра заметок при внешнем изменении хранилища.
   *
   * Реестр перечитывается по событию `notes:changed`, чтобы раздел показывал
   * актуальное состояние без перезапуска. Если раздел ни разу не открывали,
   * запрос не выполняется: реестр читается при открытии раздела, а не заранее.
   * Вызов не отслеживается: иначе запись реестра перезапустила бы этот же
   * эффект. Заметки активной книги перечитывает контроллер по своему событию
   * (`markChanged`).
   */
  $effect(() => {
    const marker = notesRevision;
    if (marker === 0) {
      return;
    }
    untrack(() => {
      if (notesLibraryLoaded) {
        void loadNotesLibrary();
      }
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
      booksPanelOpen = false;
      return;
    }
    const note = notesController.findNote(target.noteId);
    if (!note) {
      return;
    }
    pendingNoteTarget = null;
    notesPanelOpen = true;
    booksPanelOpen = false;
    goToNote(note);
  });

  /** Возврат к списку рабочих мест. */
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
    settingsOpen = false;
    notesLibraryOpen = false;
    librariesOpen = true;
    librarySourcesRequested = false;
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
      registry = updateCurrentWorkspaceTabs(registry, (state) => openBook(state, book, openTabsLimit));
      return true;
    }
    // Текущего места нет: книга ждёт выбора или создания рабочего места.
    pendingBook = book;
    pickerOpen = true;
    return false;
  }

  /** Показ области рабочего места после открытия книги. */
  function showWorkspaceArea() {
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
        { name: t('app.dialog.books'), extensions: ['epub', 'pdf', 'djvu', 'fb2'] },
        { name: t('app.dialog.allFiles'), extensions: ['*'] },
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
      showWorkspaceArea();
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
      showWorkspaceArea();
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
      notesLibraryError = t('app.error.notesBookUnavailable');
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
      showWorkspaceArea();
    }
  }

  /** Выбор рабочего места из диалога: книга открывается вкладкой в нём. */
  function pickWorkspace(id: string) {
    registry = selectWorkspace(registry, id);
    pickerOpen = false;
    if (pendingBook) {
      registry = updateCurrentWorkspaceTabs(registry, (state) =>
        openBook(
          state,
          pendingBook as { path: string; title: string; format: string },
          openTabsLimit,
        ),
      );
      pendingBook = null;
    }
    showWorkspaceArea();
  }

  /** Создание рабочего места из диалога выбора: становится текущим, книга — в нём. */
  function createWorkspaceAndOpen(name: string) {
    registry = createWorkspace(registry, name);
    pickerOpen = false;
    if (pendingBook) {
      const book = pendingBook;
      pendingBook = null;
      registry = updateCurrentWorkspaceTabs(registry, (state) => openBook(state, book, openTabsLimit));
    }
    showWorkspaceArea();
  }

  /** Закрытие диалога выбора без открытия книги. */
  function closeWorkspacePicker() {
    pickerOpen = false;
    pendingBook = null;
  }

  /** Проверка обновлений ядра и прикладных плагинов. */
  async function checkUpdates(manual: boolean) {
    try {
      const [core, plugins] = await Promise.all([
        checkCoreUpdate(),
        listPluginUpdates().catch(() => [] as PluginUpdate[]),
      ]);
      updateCore = core.core;
      updatePlugins = plugins;
      updateCurrentVersion = core.core?.current_version ?? updateCurrentVersion;
      updateError = core.errors.join('\n');
      if (updateCore || updatePlugins.length > 0) {
        updateDialogOpen = true;
      } else if (manual) {
        updateError = t('app.update.none');
      }
    } catch (error) {
      updateError = String(error);
      if (manual) {
        updateDialogOpen = true;
      }
    }
  }

  /** Автоматическая проверка обновлений при запуске. */
  async function checkUpdatesOnStartup() {
    if (updateStartupChecked) {
      return;
    }
    updateStartupChecked = true;
    const config = initialUpdate.status?.config;
    if (!config?.check_on_startup || !config.source) {
      return;
    }
    await checkUpdates(false);
  }

  /** Установка доступных обновлений: сначала плагины, затем ядро. */
  async function applyUpdates() {
    updateBusy = true;
    updateError = '';
    try {
      for (const item of updatePlugins) {
        await updatePluginFromStore(item.store, item.package.name || item.name);
      }
      if (updateCore) {
        await applyCoreUpdate();
        updateCoreApplied = true;
      }
      updateDone = true;
      updatePlugins = [];
      updateCore = null;
    } catch (error) {
      updateError = String(error);
    } finally {
      updateBusy = false;
    }
  }

  /** Закрытие диалога обновлений без установки. */
  function closeUpdateDialog() {
    if (updateCoreApplied) {
      void restartAfterUpdates();
      return;
    }
    updateDialogOpen = false;
    updateDone = false;
    updateError = '';
  }

  /** Отказ от предлагаемой версии ядра. */
  async function skipUpdateVersion() {
    if (!updateCore) {
      closeUpdateDialog();
      return;
    }
    try {
      await skipCoreUpdate(updateCore.version);
      closeUpdateDialog();
    } catch (error) {
      updateError = String(error);
    }
  }

  /** Перезапуск после установки обновлений. */
  async function restartAfterUpdates() {
    updateDialogOpen = false;
    try {
      if (updateCoreApplied) {
        await quitForCoreUpdate();
      } else {
        await restartApplication();
      }
    } catch (error) {
      updateError = String(error);
      updateDialogOpen = true;
    }
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
    // Отслеживание ширины окна: на телефонной ширине вкладки разделов уходят из
    // верхней панели в нижнюю полосу.
    const mobileQuery = window.matchMedia(NARROW_MAX_WIDTH);
    mobileWindow = mobileQuery.matches;
    const onMobileChange = (event: MediaQueryListEvent) => {
      mobileWindow = event.matches;
    };
    mobileQuery.addEventListener('change', onMobileChange);
    // Тема операционной системы нужна кнопке в шапке: при предпочтении «как в
    // системе» интерфейс показывает тему ОС, а нажатие ставит противоположную ей.
    const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemPrefersDark = colorSchemeQuery.matches;
    const onColorSchemeChange = (event: MediaQueryListEvent) => {
      systemPrefersDark = event.matches;
    };
    colorSchemeQuery.addEventListener('change', onColorSchemeChange);
    void checkUpdatesOnStartup();
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
        // Применяется только то, что действительно изменилось: событие приходит
        // по каждой сохранённой секции и содержит все её значения. Повторное
        // применение темы — это полная перерисовка документа, и на сохранении
        // любого поля (например, лимита вкладок) она давала заметную паузу.
        const theme = themeFromSettingsEvent(value);
        if (theme !== null && theme !== themePreference) {
          themePreference = theme;
          applyAppThemeTracked(theme);
        }
        // Палитра меняется в настройках; здесь достаточно применить её.
        const nextPalette = paletteFromSettingsEvent(value);
        if (nextPalette !== null && nextPalette !== palette) {
          palette = nextPalette;
          applyAppPalette(nextPalette);
        }
        // Зеркало оформления для экрана загрузки следующего запуска: обновляется
        // при любом изменении темы или палитры, независимо от источника.
        if (theme !== null || nextPalette !== null) {
          persistBootAppearance({
            theme: theme ?? themePreference,
            palette: nextPalette ?? palette,
          });
        }
        // Тема области чтения меняется как из нижней панели читалки, так и из
        // настроек; применяется ко всем вкладкам сразу.
        const nextReaderTheme = readerThemeFromSettingsEvent(value);
        if (nextReaderTheme !== null && nextReaderTheme !== readerTheme) {
          readerTheme = nextReaderTheme;
          applyAppReaderTheme(nextReaderTheme);
        }
        // Гарнитура книги меняется в настройках; переключатель в панели чтения
        // пишет то же значение, поэтому источник не важен.
        const nextReaderFont = readerFontFromSettingsEvent(value);
        if (nextReaderFont !== null && nextReaderFont !== readerFont) {
          readerFont = nextReaderFont;
          applyAppReaderFont(nextReaderFont);
        }
        // Лимит открытых вкладок меняется в настройках; применяется сразу.
        const nextOpenTabsLimit = openTabsLimitFromSettingsEvent(value);
        if (nextOpenTabsLimit !== null && nextOpenTabsLimit !== openTabsLimit) {
          openTabsLimit = nextOpenTabsLimit;
        }
        // Язык интерфейса применяется к текстам и формату дат целиком: смена
        // настройки перерисовывает все области без перезапуска.
        const nextLocale = localeFromSettingsEvent(value);
        if (nextLocale !== null && nextLocale !== currentLocale()) {
          applyAppLocale(nextLocale);
        }
      });
    })();
    return () => {
      mobileQuery.removeEventListener('change', onMobileChange);
      colorSchemeQuery.removeEventListener('change', onColorSchemeChange);
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

  /** Переход к разделу рабочего места клавишей: список мест — точка входа.
   *
   * Действие повторяет кнопку раздела в шапке, чтобы клавиша и кнопка не
   * расходились в поведении.
   */
  function hotkeyWorkspaceSection() {
    toggleWorkspace();
  }

  /** Смена темы клавишей: то же переключение, что у кнопки в шапке. */
  function hotkeyTheme() {
    toggleTheme();
  }

  /** Набор обработчиков оболочки для общего диспетчера клавиатуры. */
  const APP_HOTKEYS = {
    'app.section.workspace': hotkeyWorkspaceSection,
    'app.section.library': toggleLibraries,
    'app.section.notes': toggleNotesLibrary,
    'app.settings': toggleSettings,
    'app.notifications': toggleNotifications,
    'app.theme': hotkeyTheme,
    'app.dismiss': dismissTop,
  } as const;

  /** Регистрация клавиш оболочки и единственного слушателя окна.
   *
   * Слушатель снимается вместе с оболочкой; обработчики областей рабочего места
   * и чтения регистрируются там, где живут их действия, — в одном диспетчере.
   */
  $effect(() => {
    const unregister = hotkeys.register('app', APP_HOTKEYS);
    const onKeyDown = (event: KeyboardEvent) => {
      hotkeys.handle(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unregister();
    };
  });

  /** Модальные окна поверх приложения: пока они открыты, клавиши не меняют то,
   * что за ними. Настройки и панели слоями не считаются — это разделы. */
  $effect(() => {
    hotkeys.setModalOpen(pickerOpen || updateDialogOpen);
  });
</script>

<div class="flex h-full flex-col" data-mobile={mobileWindow ? 'true' : 'false'}>
  <!--
    Верхняя панель — постоянный «корешок»: имя приложения, вкладки разделов и
    служебные действия. Скрывается в сосредоточенном чтении (книге — всё окно)
    и в полноэкранных настройках (у них своя шапка с закрытием).
  -->
  {#if !focusMode && !settingsOpen}
    <AppBar
      section={appContext.section}
      selection={appContext.selection}
      workspaceActive={workspaceListVisible}
      libraryActive={librariesVisible}
      notesActive={notesLibraryVisible}
      {notificationsOpen}
      {settingsOpen}
      {unreadCount}
      alertCount={headerAlerts.length}
      alertTitles={headerAlerts.map((alert) => alert.text).join('\n')}
      alertError={headerAlerts.some((alert) => !alert.warning)}
      theme={resolvedTheme}
      themeNext={oppositeTheme(resolvedTheme)}
      mobile={mobileWindow}
      onWorkspace={toggleWorkspace}
      onLibrary={toggleLibraries}
      onNotes={toggleNotesLibrary}
      onNotifications={toggleNotifications}
      onSettings={toggleSettings}
      onTheme={toggleTheme}
    />
  {/if}

  <div class="relative flex min-h-0 flex-1">
  <!--
    Панель уведомлений выезжает справа, под своим пунктом в верхней панели:
    элемент управления и то, чем он управляет, остаются рядом. Панель идёт от
    верха области и не перекрывает панель раздела. Она остаётся смонтированной и
    в скрытом виде: иначе потеряла бы события журнала, пришедшие, пока она скрыта,
    и показала бы устаревший список.
  -->
  <div
    class="flex min-w-0 flex-none max-lg:absolute max-lg:inset-0 max-lg:z-[var(--layer-panel)] max-lg:w-auto max-lg:order-none lg:order-last lg:w-[var(--notifications-panel-width)]"
    class:hidden={!notificationsOpen || settingsOpen || focusMode}
    data-testid="notifications-slot"
  >
    <NotificationsPanel
      initialEntries={initialNotifications.entries}
      initialTechnicalVisible={initialNotifications.technicalVisible}
      initialError={initialNotifications.error}
      onUnreadChange={(count) => (unreadCount = count)}
      onClose={toggleNotifications}
    />
  </div>

  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <main class="flex min-w-0 flex-1">
      {#if notesLibraryVisible}
        <div class="flex min-h-0 min-w-0 flex-1">
          <NotesLibraryPage
            sets={notesLibrarySets}
            loading={notesLibraryLoading}
            error={notesLibraryError}
            {readerTheme}
            {palette}
            onOpenSet={openNotesLibrarySet}
            onOpenNote={openNotesLibraryNote}
          />
        </div>
      {/if}
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!workspaceVisible}>
        <WorkplaceArea
          bind:this={reader}
          workspace={workspace}
          workspaces={registry.workspaces}
          currentWorkspaceId={registry.currentWorkspaceId}
          listMode={workspaceListMode}
          {focusMode}
          onToggleFocus={() => (focusMode = !focusMode)}
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
          {readerTheme}
          {readerFont}
          onChangeReaderFont={changeReaderFont}
          {palette}
          {openTabsLimit}
          onChangeReaderTheme={changeReaderTheme}
          allowedNoteTypes={currentNoteTypes}
          onToolChange={notesController.setTool}
          onSelectTab={selectTab}
          onCloseTab={removeTab}
          onDuplicateTab={duplicateCurrentTab}
          onEditTabAppearance={editTabAppearance}
          onAddBook={requestAddBook}
          onAddFile={chooseBookFile}
          onToggleBooks={toggleBooksPanel}
          onToggleNotes={toggleNotesPanel}
          onCloseNotes={closeNotesPanel}
          onQuote={notesController.addQuote}
          onTextNote={notesController.addTextNote}
          onEditNoteText={notesController.editText}
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
          onCreateWorkspace={createNewWorkspace}
          onOpenWorkspace={openWorkspace}
          onRenameWorkspace={renameExistingWorkspace}
          onRemoveWorkspace={removeExistingWorkspace}
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!librariesVisible}>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col" class:hidden={librarySourcesOpen}>
          <LibraryPage
            bind:this={libraryPage}
            initialActiveLibrary={activeLibrary}
            visible={librariesVisible && !librarySourcesOpen}
            targetWorkspaceName={workspace?.name ?? null}
            onOpenInWorkplace={openBookInWorkspace}
          />
        </div>
        <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!librarySourcesOpen}>
          <LibrariesPage
            onOpened={() => {
              // Библиотека открыта: показываем список книг и читаем сведения о ней.
              librarySourcesRequested = false;
              libraryOpened = true;
              void refreshActiveLibrary();
            }}
          />
        </div>
      </div>
      <!--
        Полноэкранный раздел настроек: собственный «корешок» раздела слева
        (на узком окне — прокручиваемая полоса сверху), а справа — содержимое
        выбранной страницы. Шапка настроек несёт заголовок и закрытие.
      -->
      <div class="flex min-h-0 min-w-0 flex-1 flex-col" class:hidden={!settingsOpen}>
        <!--
          Шапка настроек одна на все их страницы: заголовок текущего раздела и
          закрытие справа. Раньше закрытие было только у страницы «Общие» и с
          других вкладок из настроек нельзя было выйти — теперь оно всегда на
          месте.
        -->
        <header
          class="flex flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3"
          data-testid="settings-header"
        >
          <span class="min-w-0 flex-1 truncate role-heading text-[var(--foreground)]"
            >{settingsSectionTitle}</span
          >
          <Button
            variant="secondary"
            size="icon"
            title={t('app.settings.close')}
            ariaLabel={t('app.settings.close')}
            onclick={closeSettings}
          >
            <Icon name="close" />
          </Button>
        </header>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
          <!--
            Меню разделов — та же карточка, что и секции настроек: мягкое
            скругление и общий фон, а не контурная полоса сбоку. На узком окне
            оно становится прокручиваемой строкой сверху.
          -->
          <Menu
            ariaLabel={t('app.settings.sections')}
            class="shrink-0 gap-1 overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2 max-md:mx-4 max-md:mt-3 max-md:flex-row md:mx-3 md:my-3 md:w-[13rem] md:flex-none md:flex-col md:self-start"
          >
            <MenuItem active={settingsSection === 'general'} onclick={() => selectSettingsSection('general')}>
              {t('app.settings.general')}
            </MenuItem>
            <MenuItem active={settingsSection === 'system'} onclick={() => selectSettingsSection('system')}>
              {t('app.settings.updates')}
            </MenuItem>
          </Menu>
          <div class="flex min-h-0 min-w-0 flex-1">
            <div class="flex min-h-0 min-w-0 flex-1 flex-col" class:hidden={settingsSection !== 'general'}>
              <SettingsPage
                initialDeclarations={initialSettings.declarations}
                initialError={initialSettings.error}
                only={GENERAL_SECTIONS}
              />
            </div>
            <div class="flex min-h-0 min-w-0 flex-1 flex-col" class:hidden={settingsSection !== 'system'}>
              <StorePage
                initialDeclarations={initialSettings.declarations}
                initialDeclarationsError={initialSettings.error}
                initialPlugins={initialStore.plugins}
                initialStores={initialStore.stores}
                initialPending={initialStore.activationPending}
                initialError={initialStore.error}
                initialUpdate={initialUpdate.status}
                initialPluginUpdates={updatePlugins}
                onPendingChange={(pending) => (activationPending = pending)}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
    </div>
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

  <UpdateDialog
    bind:open={updateDialogOpen}
    core={updateCore}
    plugins={updatePlugins}
    currentVersion={updateCurrentVersion}
    busy={updateBusy}
    error={updateError}
    done={updateDone}
    onApply={applyUpdates}
    onLater={closeUpdateDialog}
    onSkip={skipUpdateVersion}
    onRestart={restartAfterUpdates}
  />
  </div>

  <!--
    Нижняя навигация телефона: разделы и служебные действия (уведомления, тема,
    настройки) прижаты к нижнему краю и удобны пальцу. Меню в верхней панели на
    телефоне не рисуется: активна ровно одна компоновка, разметка не дублируется.
    Скрывается в сосредоточенном чтении и в полноэкранных настройках — там своя
    шапка с закрытием.
  -->
  {#if mobileWindow && !focusMode && !settingsOpen}
    <div class="flex-none" data-testid="mobile-nav-slot">
      <SectionNav
        workspaceActive={workspaceListVisible}
        libraryActive={librariesVisible}
        notesActive={notesLibraryVisible}
        {notificationsOpen}
        {settingsOpen}
        {unreadCount}
        alertCount={headerAlerts.length}
        alertTitles={headerAlerts.map((alert) => alert.text).join('\n')}
        alertError={headerAlerts.some((alert) => !alert.warning)}
        theme={resolvedTheme}
        themeNext={oppositeTheme(resolvedTheme)}
        mobile
        onWorkspace={toggleWorkspace}
        onLibrary={toggleLibraries}
        onNotes={toggleNotesLibrary}
        onNotifications={toggleNotifications}
        onSettings={toggleSettings}
        onTheme={toggleTheme}
      />
    </div>
  {/if}
</div>
