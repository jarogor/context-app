<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button, EmptyState, ErrorState, Icon, Progress, Spinner } from '@context/ui';
  import BookReader from './BookReader.svelte';
  import WorkplaceContent from './WorkplaceContent.svelte';
  import {
    UnsupportedFormatError,
    formatFromPath,
    isSupportedFormat,
    loadBookContent,
    openBookFile,
    openBookLink,
    selectWorkplacePlugin,
    type BookContent,
    type WorkplaceSelection,
  } from './reader';
  import {
    DEFAULT_PALETTE,
    DEFAULT_READER_FONT,
    DEFAULT_READER_THEME,
    type PaletteId,
    type ReaderFontId,
    type ReaderThemeId,
  } from '@context/ui';
  import type { Note, NoteColor, NoteTool, NoteType, ShapeKind } from '../notes/notes';
  import { DEFAULT_NOTE_TOOL } from '../notes/notes';
  import NoteColorMenu from '../notes/NoteColorMenu.svelte';
  import NoteMenu from '../notes/NoteMenu.svelte';
  import NoteTextEditor from './NoteTextEditor.svelte';
  import ReaderSearchBar from './ReaderSearchBar.svelte';
  import {
    EMPTY_SEARCH_STATE,
    stepSearchIndex,
    withSearchIndex,
    type SearchState,
  } from './search-state';
  import { createSearchScheduler, SEARCH_MIN_LENGTH } from './search-scheduler';
  import type { WorkplaceSearchResult } from './workplace-protocol';
  import type { QuoteAnchor } from './reader/anchor';
  import { canStepPage, clampPage, pageProgress } from './reader/page-state';
  import { createZoomCoalescer, nextZoom, type ZoomDirection } from './zoom';
  import { hotkeys } from '../hotkeys';
  import { pushDismissLayer } from '../hotkeys/dismiss-layer';

  interface Props {
    /** Путь к файлу открытой книги (вложение вкладки). */
    path: string;
    /** Название открытой книги. */
    title: string;
    /** Начальный масштаб чтения в процентах. */
    initialZoom?: number;
    /** Начальная позиция чтения в процентах. */
    initialPosition?: number;
    /** Видима ли область рабочего места. */
    visible?: boolean;
    /** Заметки книги для подсветки. */
    notes?: Note[];
    /** Активный инструмент создания заметок. */
    tool?: NoteTool;
    /** Тема области чтения (светлая или тёмная). */
    readerTheme?: ReaderThemeId;
    /** Гарнитура книги: с засечками или без. */
    readerFont?: ReaderFontId;
    /** Палитра оформления: общий реестр дизайн-системы. */
    palette?: PaletteId;
    onStateChange?: (state: { zoom: number; position: number }) => void;
    /** Снимок состояния нижней панели чтения для рабочего места. */
    onFooter?: (snapshot: FooterSnapshot) => void;
    /** Выделение пользователя, ставшее цитатой. */
    onQuote?: (anchor: QuoteAnchor, color: NoteColor) => void;
    /** Подтверждение текстовой карточки в выбранном месте. */
    onTextNote?: (anchor: QuoteAnchor, text: string, color: NoteColor) => void;
    /** Правка текста и цвета существующей текстовой карточки. */
    onEditNoteText?: (noteId: string, text: string, color: NoteColor) => void;
    /** Готовая заметка-фигура. */
    onShape?: (anchor: QuoteAnchor, shape: ShapeKind, geometry: string, color: NoteColor) => void;
    /** Просьба указать файл недоступной книги. */
    onRepoint?: () => void;
    /** Клик по подсветке заметки: открыть панель и выбрать заметку. */
    onNoteClick?: (noteId: string) => void;
    /** Перемещение заметки или сдвиг границ цитаты. */
    onPlaceNote?: (noteId: string, anchor: QuoteAnchor, geometry?: string) => void;
    /** Убрать вкладку. */
    onRemove?: () => void;
  }

  /**
   * Снимок состояния нижней панели чтения.
   *
   * `WorkplaceArea` рисует единую нижнюю панель рабочего места из снимка
   * активной вкладки, а команды панели отправляет обратно в её читалку.
   */
  export interface FooterSnapshot {
    /** Читается ли книга плагином рабочего места. */
    workplace: boolean;
    /** Поддерживает ли плагин изменение масштаба. */
    workplaceZoom: boolean;
    /** Поддерживает ли плагин страницы. */
    workplacePages: boolean;
    /** Текущая страница плагина или `null`. */
    page: number | null;
    /** Общее число страниц плагина или `null`. */
    pageCount: number | null;
    /** Текущий масштаб в процентах. */
    zoom: number;
    /** Нижняя граница масштаба. */
    minZoom: number;
    /** Верхняя граница масштаба. */
    maxZoom: number;
    /** Прогресс чтения в процентах. */
    progress: number;
    /** Открыта ли панель поиска по книге. */
    searchOpen: boolean;
  }

  let {
    path,
    title,
    initialZoom = 100,
    initialPosition = 0,
    visible = true,
    notes = [],
    tool = DEFAULT_NOTE_TOOL,
    readerTheme = DEFAULT_READER_THEME,
    readerFont = DEFAULT_READER_FONT,
    palette = DEFAULT_PALETTE,
    onStateChange,
    onFooter,
    onQuote,
    onTextNote,
    onEditNoteText,
    onShape,
    onRepoint,
    onNoteClick,
    onPlaceNote,
    onRemove,
  }: Props = $props();

  /** Минимальный и максимальный масштаб текста в процентах. */
  const TEXT_MIN_ZOOM = 60;
  const TEXT_MAX_ZOOM = 220;
  /** Минимальный и максимальный масштаб страничного формата в процентах.
   *
   * Страницы измеряются собственной шкалой файла, поэтому диапазон шире: от
   * почти нечитаемого обзора до сильного увеличения фрагмента.
   */
  const PAGE_MIN_ZOOM = 5;
  const PAGE_MAX_ZOOM = 1000;

  /** Содержимое книги (текстовые форматы). */
  let content: BookContent | null = $state(null);
  /** Плагин рабочего места, если формат читается им. */
  let workplace: WorkplaceSelection | null = $state(null);
  /** Идёт загрузка содержимого. */
  let loading = $state(true);
  /** Ошибка загрузки содержимого. */
  let error: string | null = $state(null);
  /** Формат не поддерживается встроенным чтением. */
  let unsupported = $state(false);
  /** Книга недоступна: файл не читается или не найден. */
  let unavailable = $state(false);
  /** Масштаб текста в процентах (начальное значение берётся один раз).
   *
   * Это НАМЕРЕНИЕ пользователя: подпись кнопок меняется сразу на каждом
   * нажатии. В содержимое уходит `appliedZoom`, и уходит склеенной серией —
   * см. `zoomApply`. */
  let zoom = $state(untrack(() => initialZoom));
  /** Масштаб, реально применённый к содержимому после затишья серии. */
  let appliedZoom = $state(untrack(() => initialZoom));
  /** Масштаб плагина уже принят (или пользователь задал свой): повторно не
   * принимается. Иначе при серии нажатий плагин присылал прежний масштаб, и
   * шкала возвращалась на шаг назад — масштаб «прыгал» дважды. */
  let pluginZoomTaken = $state(false);
  /** Прогресс чтения в процентах. */
  let progress = $state(untrack(() => initialPosition));
  /** Поддерживает ли плагин рабочего места изменение масштаба. */
  let workplaceZoom = $state(true);
  /** Поддерживает ли плагин рабочего места страницы. */
  let workplacePages = $state(false);
  /** Прогресс загрузки содержимого плагина в процентах. */
  let loadProgress = $state<number | null>(null);
  /** Действующие границы масштаба: шире для страничных форматов. */
  const minZoom = $derived(workplacePages ? PAGE_MIN_ZOOM : TEXT_MIN_ZOOM);
  const maxZoom = $derived(workplacePages ? PAGE_MAX_ZOOM : TEXT_MAX_ZOOM);
  /** Текущая страница плагина рабочего места. */
  let workplacePage = $state<number | null>(null);
  /** Общее число страниц плагина рабочего места. */
  let workplacePageCount = $state<number | null>(null);
  /** Читалка текстовой книги для перехода к заметке. */
  let reader:
    | {
        goto: (note: Note) => void;
        search: (query: string) => { hits: unknown[]; truncated: boolean };
        goToSearchHit: (index: number) => void;
        clearSearch: () => void;
        scrollScreen: (direction: 1 | -1) => void;
        scrollToEdge: (edge: 'start' | 'end') => void;
      }
    | undefined = $state();
  /** Область содержимого плагина для перехода к странице и заметке. */
  let workplaceContent:
    | {
        gotoPage: (page: number) => void;
        gotoAnchor: (anchor: string, noteId?: string) => void;
        noteMenuAction: (noteId: string, action: 'move' | 'resize') => void;
        search: (query: string) => void;
        stepSearch: (delta: 1 | -1) => void;
        sendCommand: (id: string) => void;
      }
    | undefined = $state();
  /** Незавершённый якорь выделения для создания заметки. */
  let pendingAnchor: QuoteAnchor | null = $state(null);
  /** Позиция меню создания заметки. */
  let menuPosition: { x: number; y: number } | null = $state(null);
  /** Контекстное меню заметки страничного формата (прямоугольник и тип). */
  let noteMenu: {
    noteId: string;
    noteType: NoteType;
    left: number;
    top: number;
    bottom: number;
  } | null = $state(null);
  /** Незавершённая точка создания текстовой карточки. */
  let pendingTextAnchor: QuoteAnchor | null = $state(null);
  /** Правка текста существующей карточки: заметка и её текущие значения. */
  let editingTextNote: { noteId: string; text: string; color: NoteColor } | null = $state(null);
  /** Ширина области содержимого: по ней ограничивается позиция меню. */
  let readerAreaWidth = $state(0);
  /** Высота области содержимого: по ней меню переносится выше выделения. */
  let readerAreaHeight = $state(0);
  /** Открыта ли панель поиска по книге. */
  let searchOpen = $state(false);
  /** Текущий запрос поиска. */
  let searchQuery = $state('');
  /** Состояние поиска: сколько найдено и к какому вхождению ведёт переход. */
  let searchState: SearchState = $state(EMPTY_SEARCH_STATE);
  /** Идёт ли поиск, выполняемый плагином формата. */
  let searchBusy = $state(false);
  /** Ошибка поиска. */
  let searchError: string | null = $state(null);

  /** Позиция меню создания заметки внутри области содержимого.
   *
   * Координаты выделения приходят из области содержимого и уже заданы от её
   * верхнего левого угла; ограничение держит меню внутри области и над краем.
   */
  function quoteMenuStyle(): string {
    const width = readerAreaWidth;
    const height = readerAreaHeight;
    const menuWidth = 190;
    const menuHeight = 40;
    const x = Math.max(8, Math.min(menuPosition?.x ?? 0, Math.max(8, width - menuWidth - 8)));
    const preferred = (menuPosition?.y ?? 0) + 6;
    const y =
      height > 0 && preferred + menuHeight > height
        ? Math.max(8, (menuPosition?.y ?? 0) - menuHeight - 6)
        : preferred;
    return `left: ${x}px; top: ${y}px;`;
  }

  /**
   * Применение масштаба к содержимому со склейкой серии нажатий.
   *
   * Кнопки масштаба и подпись общие для всех форматов, поэтому и склейка живёт
   * здесь, а не в плагине формата: иначе каждый плагин повторял бы её сам.
   *
   * Подпись и состояние вкладки меняются сразу на нажатии (это намерение
   * пользователя), а содержимое получает масштаб склеенной серией — несколько
   * нажатий подряд дают одну перестройку страницы.
   */
  const zoomApply = createZoomCoalescer((value) => {
    appliedZoom = value;
  });

  /** Сообщение об изменении состояния чтения вкладки. */
  function reportState() {
    onStateChange?.({ zoom, position: progress });
  }

  /** Переход к заданному номеру страницы с учётом границ. */
  function goToPage(page: number) {
    workplaceContent?.gotoPage(clampPage(page, workplacePageCount));
  }

  /** Переход к соседней странице с учётом границ. */
  function stepPage(delta: number) {
    if (workplacePage !== null && canStepPage(workplacePage, workplacePageCount, delta)) {
      workplaceContent?.gotoPage(workplacePage + delta);
    }
  }

  /** Переключение панели поиска по книге.
   *
   * Закрытие поиска снимает подсветку найденного: она рабочий слой, а не
   * заметка, и без панели читалась бы как случайная разметка книги.
   */
  function toggleSearch() {
    searchOpen = !searchOpen;
    if (!searchOpen) {
      resetSearch();
    }
  }

  /** Регистрация панели поиска слоем закрытия.
   *
   * Escape приходит от общего диспетчера действий: панель сообщает о себе, пока
   * открыта, и закрывается в порядке появления вместе с остальными слоями — без
   * собственного обработчика клавиши.
   */
  $effect(() => {
    if (!searchOpen) {
      return;
    }
    return pushDismissLayer(() => {
      searchOpen = false;
      resetSearch();
    });
  });

  /** Регистрация меню создания заметки слоем закрытия. */
  $effect(() => {
    if (!pendingAnchor) {
      return;
    }
    return pushDismissLayer(dismissWorkplaceMenu);
  });

  /** Регистрация контекстного меню заметки слоем закрытия. */
  $effect(() => {
    if (!noteMenu) {
      return;
    }
    return pushDismissLayer(closeNoteMenu);
  });

  /** Регистрация правки текста заметки слоем закрытия. */
  $effect(() => {
    if (!pendingTextAnchor && !editingTextNote) {
      return;
    }
    return pushDismissLayer(() => {
      if (pendingTextAnchor) {
        pendingTextAnchor = null;
      }
      if (editingTextNote) {
        editingTextNote = null;
      }
    });
  });

  /** Планировщик поиска: набор запроса не запускает поиск на каждую букву.
   *
   * Поиск по всему тексту книги — заметная работа, поэтому он идёт после
   * затишья набора, а запрос короче двух символов не ищется вовсе.
   */
  const searchScheduler = createSearchScheduler({
    run: (needle) => applySearch(needle),
    onReset: () => clearSearchResults(),
  });

  /** Снятие результата поиска во всех видах содержимого. */
  function clearSearchResults() {
    searchState = EMPTY_SEARCH_STATE;
    searchBusy = false;
    reader?.clearSearch();
    workplaceContent?.search('');
  }

  /** Снятие поиска во всех видах содержимого. */
  function resetSearch() {
    searchScheduler.cancel();
    searchQuery = '';
    searchError = null;
    clearSearchResults();
  }

  /** Изменение запроса поиска: поиск запускается после затишья набора. */
  function changeSearch(query: string) {
    searchQuery = query;
    searchError = null;
    searchScheduler.change(query);
  }

  /** Выполнение поиска по готовому запросу в области чтения формата. */
  function applySearch(needle: string) {
    if (reader) {
      const result = reader.search(needle);
      searchState = {
        total: result.hits.length,
        index: result.hits.length > 0 ? 0 : null,
        truncated: result.truncated,
      };
      // Первое вхождение показывается сразу: иначе поиск находил бы места, но
      // не показывал ни одного, и пользователь не видел результата.
      if (result.hits.length > 0) {
        reader.goToSearchHit(0);
      }
      return;
    }
    if (workplaceContent) {
      // Плагин формата ищет по текстовому слою страниц и отвечает событием
      // `search`: ответ несёт запрос, поэтому устаревший ответ не применяется.
      searchBusy = true;
      searchState = EMPTY_SEARCH_STATE;
      workplaceContent.search(needle);
      return;
    }
    // Область чтения ещё не готова: запрос применится, когда она появится.
    searchBusy = true;
  }

  /** Переход к соседнему вхождению поиска по кругу. */
  function stepSearch(delta: 1 | -1) {
    // Отложенный поиск ещё не выполнен (Enter сразу после набора): сначала
    // применяется запрос, а переход делает уже следующий Enter.
    if (searchScheduler.flush()) {
      return;
    }
    const next = stepSearchIndex(searchState, delta);
    if (next === null) {
      return;
    }
    searchState = withSearchIndex(searchState, next);
    if (reader) {
      reader.goToSearchHit(next);
    } else {
      workplaceContent?.stepSearch(delta);
    }
  }

  /** Результат поиска, сообщённый плагином формата. */
  function handleWorkplaceSearch(result: WorkplaceSearchResult) {
    // Ответ на прежний запрос (пользователь уже дописал слово) не применяется.
    if (result.query.trim() !== searchQuery.trim()) {
      return;
    }
    searchBusy = false;
    searchState = {
      total: result.total,
      index: result.index,
      truncated: result.truncated === true,
    };
  }

  /** Применение текущего запроса, когда область чтения стала готова.
   *
   * Поиск можно открыть и набирать, пока книга ещё грузится: тогда запрос
   * сохраняется и применяется сразу после появления области чтения, а не
   * теряется. Реагирует только на появление области — набор в поле запроса
   * ищет сам, эффект повторного запроса не вызывает.
   */
  let searchAreaReady = $state(false);
  $effect(() => {
    const ready = reader !== undefined || workplaceContent !== undefined;
    if (!ready || searchAreaReady) {
      return;
    }
    untrack(() => {
      searchAreaReady = true;
      if (searchQuery.trim().length < SEARCH_MIN_LENGTH) {
        return;
      }
      applySearch(searchQuery.trim());
    });
  });

  /** Создание заметки-цитаты по выделению на странице заданным цветом. */
  function confirmWorkplaceQuote(color: NoteColor) {
    const anchor = pendingAnchor;
    dismissWorkplaceMenu();
    if (anchor) {
      onQuote?.(anchor, color);
    }
  }

  /** Отмена меню создания заметки. */
  function dismissWorkplaceMenu() {
    pendingAnchor = null;
    menuPosition = null;
  }

  /** Закрытие контекстного меню заметки страничного формата. */
  function closeNoteMenu() {
    noteMenu = null;
  }

  /** Команда меню заметки: перемещение или правка границ. */
  function runNoteMenuAction(action: 'move' | 'resize') {
    const menu = noteMenu;
    noteMenu = null;
    if (menu) {
      workplaceContent?.noteMenuAction(menu.noteId, action);
    }
  }

  /** Открытие правки текста карточки по её контекстному меню (плагин рабочего места). */
  function startEditNoteText() {
    const menu = noteMenu;
    noteMenu = null;
    if (menu) {
      openNoteTextEditor(menu.noteId);
    }
  }

  /** Открытие окна правки текста заметки типа `text` из встроенного чтения. */
  function startEditNoteTextInReader(noteId: string) {
    openNoteTextEditor(noteId);
  }

  /** Открытие окна правки текста: заметка ищется в активном наборе по типу. */
  function openNoteTextEditor(noteId: string) {
    const note = notes.find((candidate) => candidate.id === noteId);
    if (!note || note.type !== 'text') {
      return;
    }
    editingTextNote = { noteId: note.id, text: note.text, color: note.color };
  }

  /** Подтверждение правки текста карточки: сохранение текста и цвета заметки. */
  function commitEditNoteText(text: string, color: NoteColor) {
    const editing = editingTextNote;
    editingTextNote = null;
    if (editing) {
      onEditNoteText?.(editing.noteId, text, color);
    }
  }

  /** Отмена правки текста карточки. */
  function cancelEditNoteText() {
    editingTextNote = null;
  }

  /** Начало ввода текстовой карточки в выбранной точке. */
  function startTextCard(anchor: QuoteAnchor) {
    pendingTextAnchor = anchor;
  }

  /** Подтверждение текстовой карточки: пустой текст не сохраняется. */
  function commitTextCard(text: string, color: NoteColor) {
    const anchor = pendingTextAnchor;
    pendingTextAnchor = null;
    if (anchor) {
      onTextNote?.(anchor, text, color);
    }
  }

  /** Отмена ввода текстовой карточки. */
  function cancelTextCard() {
    pendingTextAnchor = null;
  }

  /** Загрузка содержимого книги.
   *
   * Рабочее место не знает, откуда книга: файл читается ядром по пути. Если
   * файл не найден или не читается, вкладка предлагает указать файл заново, а
   * не завершает работу.
   */
  async function load(value: string) {
    loading = true;
    error = null;
    unsupported = false;
    unavailable = false;
    content = null;
    workplace = null;
    try {
      const format = formatFromPath(value);
      if (!format) {
        unsupported = true;
        return;
      }
      if (isSupportedFormat(format)) {
        content = await loadBookContent(value);
      } else {
        const selection = await selectWorkplacePlugin(value);
        if (selection) {
          workplace = selection;
        } else {
          unsupported = true;
        }
      }
    } catch (e) {
      if (e instanceof UnsupportedFormatError) {
        unsupported = true;
      } else {
        unavailable = true;
        error = String(e);
      }
    } finally {
      loading = false;
    }
  }

  /** Изменение масштаба текста в допустимых границах по общей лестнице уровней.
   *
   * Шаг не фиксирован: и увеличение, и уменьшение переходят к соседнему уровню
   * шкалы (`nextZoom`), поэтому шкала обратима и не ломается у нижней границы.
   */
  function changeZoom(direction: ZoomDirection) {
    // Пользователь задал масштаб сам: значение плагина больше не принимается.
    pluginZoomTaken = true;
    zoom = nextZoom(zoom, direction, minZoom, maxZoom);
    // Подпись и состояние вкладки — сразу, содержимое — склеенной серией.
    reportState();
    zoomApply.request(zoom);
  }

  /** Открытие файла книги. */
  async function openFile() {
    error = null;
    try {
      await openBookFile(path);
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => {
    void load(path);
  });

  /** Снимок состояния нижней панели для рабочего места. */
  export function footerSnapshot(): FooterSnapshot {
    return {
      workplace: workplace !== null,
      workplaceZoom,
      workplacePages,
      page: workplacePage,
      pageCount: workplacePageCount,
      zoom,
      minZoom,
      maxZoom,
      progress,
      searchOpen,
    };
  }

  /** Изменение масштаба из нижней панели рабочего места. */
  export function changeFooterZoom(direction: ZoomDirection) {
    changeZoom(direction);
  }

  /** Переход к соседней странице из нижней панели рабочего места. */
  export function stepFooterPage(delta: number) {
    stepPage(delta);
  }

  /** Переход к заданному номеру страницы из нижней панели рабочего места. */
  export function gotoFooterPage(page: number) {
    goToPage(page);
  }

  /** Переключение панели поиска из нижней панели рабочего места. */
  export function toggleFooterSearch() {
    toggleSearch();
  }

  /** Есть ли чем выполнять действия чтения (книга открыта и читается). */
  const readerReady = $derived(reader !== undefined || workplaceContent !== undefined);

  /** Прокрутка содержимого книги по действию клавиатуры.
   *
   * У плагина формата прокруткой владеет модуль рисования — ему уходит команда
   * по протоколу. У встроенного чтения прокручивается документ главы; делается
   * это здесь, а не обработчиком клавиши, чтобы навигация по книге была одной
   * точкой и не расходилась между форматами.
   */
  function scrollScreen(direction: 1 | -1) {
    if (workplaceContent) {
      workplaceContent.sendCommand(direction > 0 ? 'reader.screen.next' : 'reader.screen.prev');
      return;
    }
    reader?.scrollScreen(direction);
  }

  /** Прокрутка содержимого книги к началу или концу. */
  function scrollEdge(edge: 'start' | 'end') {
    if (workplaceContent) {
      workplaceContent.sendCommand(edge === 'start' ? 'reader.book.start' : 'reader.book.end');
      return;
    }
    reader?.scrollToEdge(edge);
  }

  /** Действия клавиатуры чтения книги.
   *
   * Регистрируются, пока открыта книга: без неё комбинации масштаба, поиска и
   * прокрутки не перехватываются. Панель поиска и масштаб — те же команды, что и
   * у кнопок нижней панели, поэтому клавиша и кнопка не расходятся.
   */
  const READER_HOTKEYS = {
    'reader.search': () => {
      if (!readerReady) {
        return false;
      }
      if (!searchOpen) {
        toggleSearch();
      }
      return true;
    },
    'reader.search.next': () => {
      if (!readerReady) {
        return false;
      }
      if (!searchOpen) {
        toggleSearch();
        return true;
      }
      stepSearch(1);
      return true;
    },
    'reader.search.prev': () => {
      if (!readerReady || !searchOpen) {
        return false;
      }
      stepSearch(-1);
      return true;
    },
    'reader.zoom.in': () => {
      if (!readerReady) {
        return false;
      }
      changeZoom(1);
      return true;
    },
    'reader.zoom.out': () => {
      if (!readerReady) {
        return false;
      }
      changeZoom(-1);
      return true;
    },
    'reader.screen.next': () => {
      if (!readerReady) {
        return false;
      }
      scrollScreen(1);
      return true;
    },
    'reader.screen.prev': () => {
      if (!readerReady) {
        return false;
      }
      scrollScreen(-1);
      return true;
    },
    'reader.book.start': () => {
      if (!readerReady) {
        return false;
      }
      scrollEdge('start');
      return true;
    },
    'reader.book.end': () => {
      if (!readerReady) {
        return false;
      }
      scrollEdge('end');
      return true;
    },
  } as const;

  $effect(() => {
    // Действия чтения доступны, только пока видна сама книга: вкладки остаются
    // смонтированными, и без этой проверки скрытая книга перехватывала бы
    // PageDown и Ctrl+F на других разделах.
    if (!visible) {
      return;
    }
    return hotkeys.register('reader', READER_HOTKEYS);
  });

  /**
   * Публикация снимка нижней панели активной вкладки.
   *
   * Снимок отправляется при каждом изменении его полей: рабочее место рисует
   * единую нижнюю панель из снимка активной вкладки. Скрытые вкладки тоже
   * публикуют свои снимки, но рабочее место их игнорирует, пока вкладка не
   * станет активной.
   */
  $effect(() => {
    const snapshot = footerSnapshot();
    // Колбэк читается вне отслеживания: иначе обновление родителя (новый
    // инлайн-колбэк) снова запускало бы эффект и цикл обновлений.
    untrack(() => onFooter?.(snapshot));
  });

  /** Переход к месту заметки в тексте книги.
   *
   * Используется панелью заметок: чтение возвращается к выделению заметки.
   */
  export function goto(note: Note) {
    noteMenu = null;
    reader?.goto(note);
    if (workplace) {
      workplaceContent?.gotoAnchor(note.anchor, note.id);
    }
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="min-h-0 flex-1 overflow-hidden">
    {#if loading}
      <div
        class="flex h-full items-center justify-center gap-2 text-[var(--muted-foreground)]"
        data-testid="reader-loading"
      >
        <Spinner />
        <span>Открытие книги…</span>
      </div>
    {:else if unavailable}
      <div class="mx-auto max-w-[35rem] p-6" data-testid="reader-unavailable">
        <EmptyState icon="book" title={title} description="Книга недоступна: возможно, файл перемещён или переименован.">
          {#snippet action()}
            <div class="flex flex-wrap justify-center gap-2">
              {#if onRepoint}
                <Button variant="primary" onclick={onRepoint}>Указать файл</Button>
              {/if}
              {#if onRemove}
                <Button variant="ghost" onclick={onRemove}>Убрать вкладку</Button>
              {/if}
            </div>
          {/snippet}
        </EmptyState>
      </div>
    {:else if unsupported}
      <div class="mx-auto max-w-[35rem] p-6">
        <EmptyState
          icon="book"
          title="Формат не поддерживается"
          description="Формат этой книги пока не поддерживается встроенным чтением."
        >
          {#snippet action()}
            <Button variant="secondary" onclick={openFile}>Открыть</Button>
          {/snippet}
        </EmptyState>
      </div>
    {:else if error}
      <div class="mx-auto max-w-[35rem] p-6 text-center" data-testid="reader-error">
        <ErrorState message={`Не удалось открыть книгу: ${error}`} />
        {#if onRemove}
          <Button variant="ghost" class="mt-3" onclick={onRemove}>Убрать вкладку</Button>
        {/if}
      </div>
    {:else if workplace}
      <div
        class="relative h-full w-full"
        bind:clientWidth={readerAreaWidth}
        bind:clientHeight={readerAreaHeight}
      >
        {#if loadProgress !== null}
          <div
            class="pointer-events-none absolute inset-x-0 top-0 z-20"
            data-testid="reader-load-progress"
          >
            <Progress value={loadProgress} />
          </div>
        {/if}
        {#if searchOpen}
          <ReaderSearchBar
            query={searchQuery}
            state={searchState}
            busy={searchBusy}
            error={searchError}
            onQuery={changeSearch}
            onStep={stepSearch}
            onClose={toggleSearch}
          />
        {/if}
        <WorkplaceContent
          bind:this={workplaceContent}
          pluginId={workplace.pluginId}
          {path}
          {title}
          zoom={appliedZoom}
          initialPosition={initialPosition}
          {notes}
          {tool}
          {readerTheme}
          {palette}
          {visible}
          onCapabilities={(value) => {
            workplaceZoom = value.zoom !== false;
            workplacePages = value.pages === true;
          }}
          onLoadProgress={(value) => (loadProgress = value)}
          onState={(value) => {
            workplacePage = value.page;
            workplacePageCount = value.pages;
            if (value.pages && value.page) {
              progress = pageProgress(value.page, value.pages);
            }
            // Плагин сам выбирает удобный масштаб (например, подгонку по ширине
            // при открытии): приложение принимает его ОДИН раз, пока
            // пользователь не задал масштаб. Повторный приём возвращал шкалу на
            // шаг назад после каждого нажатия — масштаб менялся дважды.
            if (!pluginZoomTaken && typeof value.zoom === 'number' && value.zoom > 0) {
              pluginZoomTaken = true;
              if (value.zoom !== zoom) {
                zoom = value.zoom;
                // Плагин уже применил этот масштаб: повторно его не шлём.
                appliedZoom = value.zoom;
              }
            }
            reportState();
          }}
          onProgress={(value) => {
            progress = value;
            reportState();
          }}
          onSelection={(anchor, position) => {
            pendingAnchor = anchor;
            menuPosition = position;
          }}
          onSelectionCleared={dismissWorkplaceMenu}
          onTextPoint={(anchor) => startTextCard(anchor)}
          onShape={(anchor, shape, geometry, color) =>
            onShape?.(anchor, shape, geometry, color)}
          onNoteClick={(noteId) => onNoteClick?.(noteId)}
          onNoteMenu={(menu) => (noteMenu = menu)}
          onNoteMenuClose={closeNoteMenu}
          onPlaceNote={(noteId, anchor, geometry) => onPlaceNote?.(noteId, anchor, geometry)}
          onError={(value) => (error = value)}
          onSearch={handleWorkplaceSearch}
          onHotkey={(actionId) => hotkeys.handleViewerAction(actionId)}
        />
        {#if noteMenu}
          <NoteMenu
            type={noteMenu.noteType}
            quote={notes.find((note) => note.id === noteMenu?.noteId)?.quote ?? ''}
            at={{ left: noteMenu.left, top: noteMenu.top, bottom: noteMenu.bottom }}
            area={{ width: readerAreaWidth, height: readerAreaHeight }}
            onMove={() => runNoteMenuAction('move')}
            onResize={() => runNoteMenuAction('resize')}
            onEditText={startEditNoteText}
            onClose={closeNoteMenu}
          />
        {/if}
        {#if menuPosition && pendingAnchor}
          <div
            class="absolute z-[var(--layer-popup)] flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--overlay-surface)] p-[0.25rem] shadow-overlay"
            data-testid="quote-menu"
            style={quoteMenuStyle()}
          >
            <NoteColorMenu labelPrefix="Создать заметку" onpick={confirmWorkplaceQuote} />
            <Button
              variant="ghost"
              size="icon"
              title="Отмена"
              ariaLabel="Отмена"
              onclick={dismissWorkplaceMenu}
            >
              <Icon name="close" />
            </Button>
          </div>
        {/if}
        {#if pendingTextAnchor}
          <NoteTextEditor
            initialColor={tool.color}
            onConfirm={commitTextCard}
            onCancel={cancelTextCard}
          />
        {/if}
        {#if editingTextNote}
          <NoteTextEditor
            initialText={editingTextNote.text}
            initialColor={editingTextNote.color}
            onConfirm={commitEditNoteText}
            onCancel={cancelEditNoteText}
          />
        {/if}
      </div>
    {:else if content}
      <div class="relative h-full w-full">
        <BookReader
          bind:this={reader}
          {content}
          zoom={appliedZoom}
          {initialPosition}
          {notes}
          {visible}
          {tool}
          {readerTheme}
          {readerFont}
          {palette}
          onQuote={(anchor, color) => onQuote?.(anchor, color)}
          onTextPoint={(anchor) => startTextCard(anchor)}
          onShape={(anchor, shape, geometry, color) => onShape?.(anchor, shape, geometry, color)}
          onSelectNote={(noteId) => onNoteClick?.(noteId)}
          onPlaceNote={(noteId, anchor, geometry) => onPlaceNote?.(noteId, anchor, geometry)}
          onEditText={startEditNoteTextInReader}
          onOpenLink={(href) => void openBookLink(href).catch(() => undefined)}
          onProgress={(value) => {
            progress = value;
            reportState();
          }}
          onSearchResult={(result) => {
            // Документ книги построился после запроса: подсветка на месте, а
            // счётчик обновляется итогом отложенного поиска.
            searchState = {
              total: result.hits.length,
              index: result.hits.length > 0 ? 0 : null,
              truncated: result.truncated,
            };
            searchBusy = false;
          }}
        />        {#if searchOpen}
          <ReaderSearchBar
            query={searchQuery}
            state={searchState}
            busy={searchBusy}
            error={searchError}
            onQuery={changeSearch}
            onStep={stepSearch}
            onClose={toggleSearch}
          />
        {/if}
        {#if pendingTextAnchor}
          <NoteTextEditor
            initialColor={tool.color}
            onConfirm={commitTextCard}
            onCancel={cancelTextCard}
          />
        {/if}
        {#if editingTextNote}
          <NoteTextEditor
            initialText={editingTextNote.text}
            initialColor={editingTextNote.color}
            onConfirm={commitEditNoteText}
            onCancel={cancelEditNoteText}
          />
        {/if}
      </div>
    {/if}
  </div>
</div>
