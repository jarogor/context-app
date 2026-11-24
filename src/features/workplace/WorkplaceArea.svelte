<script lang="ts">
  import { t } from '@context/i18n';
  import WorkplaceTabPage, { type TabReader } from './WorkplaceTabPage.svelte';
  import ActiveTabBar from './ActiveTabBar.svelte';
  import OpenBooksPanel from './OpenBooksPanel.svelte';
  import NotesPanel from '../notes/NotesPanel.svelte';
  import BookBar from '../reader/BookBar.svelte';
  import type { FooterSnapshot } from '../reader/ReaderPage.svelte';
  import WorkspacesPage from './WorkspacesPage.svelte';
  import { EmptyState } from '@context/ui';
  import { activeTab } from './workplace';
  import FilePropertiesPanel from '../reader/FilePropertiesPanel.svelte';
  import SearchPanel from '../reader/SearchPanel.svelte';
  import { emptyProperties } from '../reader/file-properties';
  import { formatFromPath } from '../reader/reader';
  import type {
    FileAnnotation,
    FileBookmark,
    FileChapter,
    FilePropertiesSnapshot,
    PropertiesTabId,
  } from '../reader/file-properties';
  import type { TabAppearancePatch } from './workplace';
  import type { WorkspaceRecord } from './workspace-registry';
  import { NARROW_MAX_WIDTH } from '../../shared/breakpoints';
  import type { Note, NoteListItem, NoteSetSummary, NoteTool, NoteType, ShapeKind } from '../notes/notes';
  import { NOTE_TYPES } from '../notes/notes';
  import NoteToolMenu from '../notes/NoteToolMenu.svelte';
  import ReaderFontToggle from '../reader/ReaderFontToggle.svelte';
  import type { QuoteAnchor } from '../reader/reader/anchor';
  import type { NoteColor } from '../notes/notes';
  import { EMPTY_SEARCH_STATE } from '../reader/search-state';
  import { hotkeys } from '../hotkeys';
  import {
    DEFAULT_READER_FONT,
    DEFAULT_READER_THEME,
    type PaletteId,
    type ReaderFontId,
    type ReaderThemeId,
  } from '@context/ui';

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
    /** Открыта ли панель свойств файла. */
    propertiesOpen?: boolean;
    /** Открыта ли панель поиска по книге. */
    searchOpen?: boolean;
    /** Открытие панели поиска по книге. */
    onOpenSearchPanel?: () => void;
    /** Закрытие панели поиска по книге. */
    onCloseSearch?: () => void;
    /** Выбранная вкладка панели свойств. */
    propertiesTab?: PropertiesTabId | null;
    /** Снимки свойств открытых книг по идентификатору вкладки. */
    propertiesByTab?: Record<string, FilePropertiesSnapshot>;
    /** Переключение панели свойств файла. */
    onToggleProperties?: () => void;
    /** Выбор вкладки панели свойств. */
    onSelectPropertiesTab?: (tab: PropertiesTabId) => void;
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
    /** Видима ли область рабочего места. */
    visible: boolean;
    /** Выбор вкладки. */
    onSelectTab: (id: string) => void;
    /** Закрытие вкладки. */
    onCloseTab: (id: string) => void;
    /** Дублирование вкладки. */
    onDuplicateTab: (id: string) => void;
    /** Перемещение вкладки на новую позицию в составе рабочего места. */
    onReorderTab: (id: string, toIndex: number) => void;
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
    /** Текучая ли книга активной вкладки: это сообщает плагин формата. */
    onFlowingChange?: (flowing: boolean) => void;
    /** Просьба переуказать файл недоступной книги вкладки. */
    onRepointTab: (id: string) => void;
    /** Гарнитура книги: с засечками или без. */
    readerFont?: ReaderFontId;
    /** Переключение гарнитуры книги. */
    onChangeReaderFont?: (font: ReaderFontId) => void;
    /** Режим сосредоточенного чтения. */
    focusMode?: boolean;
    /** Переключение режима сосредоточенного чтения. */
    onToggleFocus?: () => void;
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
    propertiesOpen = false,
    searchOpen = false,
    onOpenSearchPanel,
    onCloseSearch,
    propertiesTab = null,
    propertiesByTab = {},
    onToggleProperties,
    onSelectPropertiesTab,
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
    onReorderTab,
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
    readerFont = DEFAULT_READER_FONT,
    onChangeReaderFont,
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
    onFlowingChange,
    onRepointTab,
    focusMode = false,
    onToggleFocus,
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

  /**
   * Вкладки, которые уже открывали: их читалки смонтированы.
   *
   * Открытие рабочего места не должно читать все книги сразу: пока пользователь
   * не выбрал вкладку, её книга не нужна. Активная вкладка добавляется в набор
   * отдельно, поэтому она открывается сразу, а остальные — только при первом
   * выборе и остаются смонтированными дальше.
   */
  let openedTabIds = $state<string[]>([]);

  $effect(() => {
    const id = workspace?.activeTabId ?? null;
    if (id && !openedTabIds.includes(id)) {
      openedTabIds = [...openedTabIds, id];
    }
  });

  // Вкладки, убранные из места, забываются: их читалки размонтированы, и держать
  // их в наборе незачем.
  $effect(() => {
    const ids = new Set((workspace?.tabs ?? []).map((item) => item.id));
    const kept = openedTabIds.filter((id) => ids.has(id));
    if (kept.length !== openedTabIds.length) {
      openedTabIds = kept;
    }
  });

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

  /** Снимки свойств файла открытых книг: оболочка хранит их по вкладкам. */
  let propertiesTabs: Record<string, FilePropertiesSnapshot> = $state({});

  /** Снимки свойств извне (для тестов и внешних областей). */
  const externalProperties = $derived(propertiesByTab);

  /** Снимки свойств для панели: пришедшие от читалок плюс внешние. */
  const mergedProperties = $derived({ ...propertiesTabs, ...externalProperties });

  /** Снимок свойств вкладки, пришедший от читалки. */
  function handleProperties(tabId: string, snapshot: FilePropertiesSnapshot) {
    propertiesTabs = { ...propertiesTabs, [tabId]: snapshot };
  }

  /** Снимок свойств активной вкладки. */
  const activeProperties = $derived(tab ? (mergedProperties[tab.id] ?? null) : null);

  /** Снимок нижней панели активной вкладки. */
  const activeFooter = $derived(tab ? (footerByTab[tab.id] ?? null) : null);

  /**
   * Узкая компоновка: панель области накрывает книгу целиком.
   *
   * Это не «второй режим панели на всякий случай», а отдельная компоновка —
   * телефон и планшет, — где рядом с книгой места нет вовсе. На десктопе её не
   * бывает: минимальный размер окна не даёт уйти ниже порога.
   */
  function coversReading(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(NARROW_MAX_WIDTH).matches;
  }

  /*
   * Панель всегда стоит рядом с книгой и никогда её не накрывает.
   *
   * Раньше у панели было два режима: рядом и поверх. Второй появлялся, когда
   * рядом не оставалось места, и это порождало целый класс дефектов: панель
   * налезала на текст, меню заметки висело поверх неё, кнопки показывали не то
   * состояние. Режим один, а тесноту не даёт создать минимальный размер окна.
   *
   * Три панели занимают одно и то же место — слева от книги, — поэтому открыта
   * может быть только одна.
   */

  /** Плагин сообщил, что книга текучая: текст течёт и гарнитура применима.
   *
   * Список форматов в оболочке не держится: возможность сообщает плагин
   * формата, а страничные книги (PDF, DjVu) её просто не объявляют.
   */
  const flowingBook = $derived(activeFooter?.flowing === true);

  /** Доступные формату типы заметок.
   *
   * У текучей книги доступна только цитата: выбирать нечего, и на месте меню
   * инструмента показывается переключатель гарнитуры.
   */
  const noteTypesChoosable = $derived(allowedNoteTypes.length > 1);

  /** Передача признака текучести оболочке: от него зависит набор типов заметок. */
  $effect(() => {
    onFlowingChange?.(flowingBook);
  });

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
  function changeZoom(direction: 1 | -1) {
    if (tab) {
      readers.get(tab.id)?.changeFooterZoom(direction);
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

  /** Переключение панели поиска по книге.
   *
   * Поиск — отдельная панель, а не вкладка панели книги: это действие над
   * книгой, и оно не должно зажигать чужие кнопки. Панели занимают одно место,
   * поэтому открытие поиска закрывает остальные.
   */
  function toggleSearchInDock() {
    if (!tab) {
      return;
    }
    if (activeFooter?.searchOpen) {
      readers.get(tab.id)?.closeFooterSearch();
      return;
    }
    onOpenSearchPanel?.();
    readers.get(tab.id)?.openFooterSearch();
  }

  /** Изменение запроса поиска активной вкладки. */
  function setSearchQuery(value: string) {
    if (tab) {
      readers.get(tab.id)?.setFooterSearchQuery(value);
    }
  }

  /** Переход к соседнему вхождению поиска активной вкладки. */
  function stepSearch(delta: 1 | -1) {
    if (tab) {
      readers.get(tab.id)?.stepFooterSearch(delta);
    }
  }

  /**
   * Поиск, открытый клавишей, показывает свою панель.
   *
   * Поиском владеет читалка (она его выполняет), а показывает его оболочка.
   * Эффект реагирует на переход «закрыт → открыт», поэтому кнопка панели не
   * дёргает уже открытый поиск.
   */
  let searchWasOpen = $state(false);
  $effect(() => {
    const open = activeFooter?.searchOpen === true;
    if (open && !searchWasOpen) {
      onOpenSearchPanel?.();
    }
    // Поиск закрылся в читалке (Escape или снятие запроса) — его панель уходит
    // вместе с ним: панель показывает то, чего уже нет.
    if (!open && searchWasOpen && searchOpen) {
      onCloseSearch?.();
    }
    searchWasOpen = open;
  });

  /** Переход к заметке в читалке активной вкладки. */
  export function goto(note: Note) {
    if (tab) {
      readers.get(tab.id)?.goto(note);
    }
  }

  /** Снятие показа встроенных пометок активной вкладки. */
  export function hideAnnotations() {
    if (tab) {
      readers.get(tab.id)?.hideAnnotations();
    }
  }

  /**
   * Закрытие поиска по книге активной вкладки.
   *
   * Поиск — своя панель: когда её закрывают или она уступает место другой,
   * поиск должен закрыться вместе с ней. Иначе его кнопка в строке книги
   * остаётся нажатой при открытой чужой панели.
   */
  export function closeBookSearch() {
    if (tab) {
      readers.get(tab.id)?.closeFooterSearch();
    }
  }

  /** Переход к главе книги; на узкой компоновке — с закрытием панели. */
  function goToChapter(chapter: FileChapter) {
    if (tab) {
      readers.get(tab.id)?.goToChapter(chapter);
    }
    if (coversReading()) {
      onToggleProperties?.();
    }
  }

  /** Переход к странице из панели свойств; на узкой компоновке — с закрытием. */
  function goToFilePage(page: number) {
    if (tab) {
      readers.get(tab.id)?.goToFilePage(page);
    }
    if (coversReading()) {
      onToggleProperties?.();
    }
  }

  /** Переход к закладке файла; на узкой компоновке — с закрытием панели. */
  function goToBookmark(bookmark: FileBookmark) {
    if (tab) {
      readers.get(tab.id)?.goToBookmark(bookmark);
    }
    if (coversReading()) {
      onToggleProperties?.();
    }
  }

  /** Заказ миниатюр страниц активной вкладки. */
  function requestThumbs(pages: number[], width: number) {
    if (tab) {
      readers.get(tab.id)?.requestThumbs(pages, width);
    }
  }

  /** Запуск анализа встроенных пометок активной вкладки. */
  function analyzeAnnotations() {
    if (tab) {
      readers.get(tab.id)?.analyzeAnnotations();
    }
  }

  /** Остановка анализа встроенных пометок активной вкладки. */
  function stopAnnotations() {
    if (tab) {
      readers.get(tab.id)?.stopAnnotations();
    }
  }

  /** Перегенерация превью страниц активной вкладки. */
  function regenerateThumbs() {
    if (tab) {
      readers.get(tab.id)?.regenerateThumbs();
    }
  }

  /** Показ или снятие показа встроенной пометки на странице.
   *
   * На узком окне панель закрывается после показа: пометка появляется на
   * странице. Панель стоит рядом и остаётся открытой: снимать её после показа
   * незачем. Снятие показа панель тоже не закрывает.
   */
  function toggleAnnotation(annotation: FileAnnotation, shown: boolean) {
    if (tab) {
      readers.get(tab.id)?.toggleAnnotation(annotation, shown);
    }
    if (shown && coversReading()) {
      onToggleProperties?.();
    }
  }

  /** Выбор заметки в панели: переход к ней.
   *
   * Панель стоит рядом с книгой и остаётся открытой: результат перехода виден
   * сразу, а список нужен для следующей заметки.
   */
  function selectNoteInPanel(note: Note) {
    onGoToNote(note);
    if (coversReading()) {
      onCloseNotes();
    }
  }

  /** Выбор вкладки в панели: переход к ней.
   *
   * Панель остаётся открытой — её показывает и скрывает кнопка панели.
   */
  function selectTabInPanel(id: string) {
    onSelectTab(id);
    if (coversReading()) {
      onToggleBooks();
    }
  }

  /** Переход к соседней вкладке клавишей: по кругу, как в браузере.
   *
   * Замена текущей вкладки — это тот же выбор вкладки, что и щелчком в полосе:
   * отдельного «горячего» пути к активной вкладке нет, иначе состояние
   * рабочего места менялось бы двумя способами.
   */
  function stepTab(delta: 1 | -1): boolean {
    const tabs = workspace?.tabs ?? [];
    if (tabs.length < 2) {
      return false;
    }
    const index = tabs.findIndex((item) => item.id === workspace?.activeTabId);
    if (index < 0) {
      return false;
    }
    const next = (index + delta + tabs.length) % tabs.length;
    onSelectTab(tabs[next].id);
    return true;
  }

  /** Действия клавиатуры рабочего места, общие для всех вкладок.
   *
   * Регистрируются, пока рабочее место смонтировано: пока оно есть в дереве,
   * его комбинации доступны, и наоборот. Проверка «есть ли сейчас чтение»
   * остаётся у читалки — она регистрирует свои действия сама.
   */
  const WORKPLACE_HOTKEYS = {
    'workplace.books': () => {
      if (!tab) {
        return false;
      }
      onToggleBooks();
    },
    'workplace.notes': () => {
      if (!tab) {
        return false;
      }
      onToggleNotes();
    },
    'workplace.properties': () => {
      if (!tab) {
        return false;
      }
      onToggleProperties?.();
    },
    'workplace.focus': () => {
      if (!tab) {
        return false;
      }
      onToggleFocus?.();
    },
    'workplace.tab.next': () => stepTab(1),
    'workplace.tab.prev': () => stepTab(-1),
    'workplace.add.book': () => {
      onAddFile();
    },
  } as const;

  $effect(() => {
    // Клавиши рабочего места доступны, только пока показан сам раздел: в
    // настройках или библиотеке они не должны менять скрытые вкладки.
    if (!visible) {
      return;
    }
    return hotkeys.register('workplace', WORKPLACE_HOTKEYS);
  });
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="workplace-area">
  {#if listMode || workspace === null}
    <WorkspacesPage
      workspaces={workspaces.map((item) => ({
        id: item.id,
        name: item.name,
        createdAtMillis: item.createdAtMillis,
        openedAtMillis: item.openedAtMillis,
        bookCount: item.tabs.length,
        bookPaths: item.tabs.map((tab) => tab.path),
      }))}
      currentId={currentWorkspaceId}
      onCreate={onCreateWorkspace}
      onOpen={onOpenWorkspace}
      onRename={onRenameWorkspace}
      onRemove={onRemoveWorkspace}
    />
  {/if}
  <!--
    Вкладки текущего места остаются смонтированными, пока место текущее, в том
    числе когда показан список рабочих мест или другой раздел приложения: показ
    списка скрывает слой вкладок, а не уничтожает его. Иначе возврат к месту
    пересоздавал бы читалки и книга читалась бы заново.
  -->
  {#if workspace !== null}
    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col"
      class:hidden={listMode}
      data-testid="workplace-tabs-layer"
      data-shown={listMode ? 'false' : 'true'}
    >
    <ActiveTabBar
      tabs={workspace.tabs}
      activeTabId={workspace.activeTabId}
      {focusMode}
      {booksOpen}
      {notesOpen}
      {propertiesOpen}
      onToggleFocus={onToggleFocus}
      onToggleBooks={onToggleBooks}
      onToggleNotes={onToggleNotes}
      onToggleProperties={() => onToggleProperties?.()}
      searchOpen={searchOpen}
      onToggleSearch={toggleSearchInDock}
    />
    <div class="relative flex min-h-0 flex-1 flex-col">
      <!--
        Рабочая часть: панель слева и книга справа. Панель одна — вкладки,
        содержание книги или заметки; они занимают одно место и открываются
        взаимоисключающе, потому что две панели подряд перекрывали бы книгу.
      -->
      <div class="relative flex min-h-0 flex-1">
        {#if booksOpen}
          <OpenBooksPanel
            tabs={workspace.tabs}
            activeTabId={workspace.activeTabId}
            {openTabsLimit}
            onAddBook={onAddBook}
            onAddFile={onAddFile}
            onSelect={selectTabInPanel}
            onClose={onCloseTab}
            onDuplicate={onDuplicateTab}
            onReorder={onReorderTab}
            onEditAppearance={onEditTabAppearance}
            onClosePanel={onToggleBooks}
          />
        {:else if notesOpen}
          <NotesPanel
            items={tabItems}
            sets={noteSets}
            activeSetId={activeSetId}
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
            onClose={onCloseNotes}
          />
        {:else if searchOpen}
          <SearchPanel
            query={activeFooter?.searchQuery ?? ''}
            state={activeFooter?.searchState ?? EMPTY_SEARCH_STATE}
            busy={activeFooter?.searchBusy ?? false}
            error={activeFooter?.searchError ?? null}
            onQuery={setSearchQuery}
            onStep={stepSearch}
            onClose={() => (onCloseSearch ? onCloseSearch() : closeBookSearch())}
          />
        {:else if propertiesOpen}
          <!--
            Панель открывается и до того, как пришли свойства вкладки: иначе
            нажатие кнопки «Книга» не давало бы видимого отклика, пока читалка
            грузится. До снимка панель показывает, что показывать нечего.

            Пересоздаётся при смене активной вкладки: показ пометки и запрос
            разбора относятся к конкретной книге и не должны переезжать на
            соседнюю.
          -->
          {#key tab?.id}
            <FilePropertiesPanel
              snapshot={activeProperties ?? emptyProperties(formatFromPath(tab?.path ?? ''))}
              tab={propertiesTab}
              currentPage={activeFooter?.page ?? null}
              onGoToChapter={goToChapter}
              onGoToBookmark={goToBookmark}
              onGoToPage={goToFilePage}
              onSelectTab={(next) => onSelectPropertiesTab?.(next)}
              onRequestThumbs={requestThumbs}
              onAnalyzeAnnotations={analyzeAnnotations}
              onStopAnnotations={stopAnnotations}
              onToggleAnnotation={toggleAnnotation}
              onRegenerateThumbs={regenerateThumbs}
              onClose={onToggleProperties}
            />
          {/key}
        {/if}
        <div
          class="relative flex min-h-0 min-w-0 flex-1 flex-col"
          data-testid="workplace-reading"
        >
        <!--
          Инструмент заметок «висит» в правом верхнем углу области чтения с
          одинаковым отступом от обоих краёв. У страничной книги это меню выбора
          типа, у текучей — переключатель гарнитуры: выбирать там нечего, кроме
          цитаты.
        -->
        {#if hasBook && tool && activeFooter}
          {#if flowingBook}
            {#if onChangeReaderFont}
              <ReaderFontToggle
                {readerFont}
                onToggle={() => onChangeReaderFont?.(readerFont === 'serif' ? 'sans' : 'serif')}
              />
            {/if}
          {:else if noteTypesChoosable}
            <NoteToolMenu {tool} allowedTypes={allowedNoteTypes} onToolChange={onToolChange} />
          {/if}
        {/if}
        {#if workspace.tabs.length === 0}
          <div class="flex h-full items-center justify-center p-6" data-testid="workplace-empty">
            <EmptyState
              icon="workspace"
              title={t('app.workplace.empty.title')}
              description={t('app.workplace.empty.description')}
            />
          </div>
        {:else}
          <!--
            Вкладки остаются смонтированными, но книга открывается не в каждой:
            читалка монтируется только для вкладки, которую уже открывали (или
            для активной). Иначе открытие рабочего места с десятком вкладок
            одновременно читало все книги, и интерфейс ждал их вместо того,
            чтобы сразу откликаться на клики.

            Открытая вкладка не пересоздаётся при переключении: её документ книги
            уже прочитан и просто становится видимым.
          -->
          {#each workspace.tabs as item (item.id)}
            {@const mounted =
              item.id === workspace.activeTabId || openedTabIds.includes(item.id)}
            <div
              class="min-h-0 min-w-0 flex-1 flex-col"
              class:flex={item.id === workspace.activeTabId}
              class:hidden={item.id !== workspace.activeTabId}
              data-testid="workplace-tab-page"
              data-active={item.id === workspace.activeTabId ? 'true' : 'false'}
            >
              {#if mounted}
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
                    {readerFont}
                    {palette}
                    active={item.id === workspace.activeTabId}
                    visible={visible && item.id === workspace.activeTabId && !listMode}
                    panel={
                      notesOpen
                        ? 'notes'
                        : searchOpen
                          ? 'search'
                          : propertiesOpen
                            ? 'properties'
                            : booksOpen
                              ? 'books'
                              : null
                    }
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
                    onProperties={(snapshot) => handleProperties(item.id, snapshot)}
                  />
                {/key}
              {/if}
            </div>
          {/each}
        {/if}
        </div>
      </div>
      <!--
        Строка книги стоит под панелью и книгой во всю ширину рабочего места,
        поэтому открытие и закрытие панели не переставляет её кнопки: основание
        того, на что нажимают, не сдвигается. Слева — где я в книге, справа —
        навигация, масштаб и остальное управление чтением.
      -->
      {#if workspace.tabs.length > 0}
        <BookBar
          path={tab?.path ?? ''}
          format={tab?.format ?? ''}
          pages={activeFooter?.workplacePages ?? false}
          page={activeFooter?.page ?? null}
          pageCount={activeFooter?.pageCount ?? null}
          progress={activeFooter?.progress ?? 0}
          zoom={activeFooter?.zoom ?? 100}
          minZoom={activeFooter?.minZoom ?? 60}
          maxZoom={activeFooter?.maxZoom ?? 220}
          showZoom={activeFooter?.workplaceZoom ?? true}
          {readerTheme}
          onToggleTheme={() =>
            onChangeReaderTheme?.(readerTheme === 'dark' ? 'light' : 'dark')}
          onStepPage={stepPage}
          onGoToPage={goToPage}
          onStepZoom={changeZoom}
        />
      {/if}
    </div>
  </div>
  {/if}
</div>
