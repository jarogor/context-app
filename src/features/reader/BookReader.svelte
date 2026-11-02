<script lang="ts">
  import { t } from '@context/i18n';
  import { onMount, untrack } from 'svelte';
  import { Button, Icon } from '@context/ui';
  import {
    applyReaderFont,
    applyReaderPalette,
    applyReaderTheme,
    DEFAULT_PALETTE,
    DEFAULT_READER_FONT,
    DEFAULT_READER_THEME,
    readerThemeTokens,
    type PaletteId,
    type ReaderFontId,
    type ReaderThemeId,
  } from '@context/ui';
  import type { BookContent } from './reader';
  import type { Note, NoteColor, NoteTool, NoteType, ShapeKind } from '../notes/notes';
  import { DEFAULT_NOTE_COLOR, DEFAULT_NOTE_TOOL, FLOWING_NOTE_TYPES, NOTE_COLOR_HIGHLIGHTS } from '../notes/notes';
  import NoteColorMenu from '../notes/NoteColorMenu.svelte';
  import NoteMenu from '../notes/NoteMenu.svelte';
  import FootnoteMenu from '../notes/FootnoteMenu.svelte';
  import {
    createAnchor,
    chapterTextOf,
    offsetsFromRange,
    parseAnchor,
    rangeFromOffsets,
    resolveAnchorRange,
    type QuoteAnchor,
  } from './reader/anchor';
  import { clearNoteMarks, highlightTextRange } from './reader/highlight';
  import {
    clearNoteOverlays,
    NOTE_OVERLAY_CLASS,
    NOTE_CARD_CLASS,
    NOTE_SHAPE_CLASS,
    parseGeometry,
    renderShape,
    renderTextCard,
    serializeGeometry,
    type ShapeGeometry,
  } from './reader/overlay';
  import {
    buildDocument,
    CHAPTER_CLASS,
    FLASH_CLASS,
    FOOTNOTE_FLASH_CLASS,
    NOTE_CLASS,
    NOTE_PREVIEW_CLASS,
  } from './reader/reader-document';
  import {
    chapterAt,
    charOffset,
    clamp01,
    pointFraction,
    rangeHandleRect,
  } from './reader/geometry';
  import { applyZoom, captureAnchor, restoreAnchor } from './reader/zoom-anchor';
  import { anchorTarget, parseBookLink } from './reader/book-link';
  import { bookFootnote, footnoteContentHtml, installFootnoteReturns, FOOTNOTE_BACK_CLASS } from './reader/footnote';
  import { clearSelectionLayer, renderSelectionLayer } from './reader/selection';
  import {
    clearSearchHighlights,
    highlightSearchHits,
    SEARCH_ACTIVE_CLASS,
    SEARCH_CLASS,
  } from './reader/search-mark';
  import { searchBook, type SearchHit, type SearchResult } from './reader/search';
  import { comboOfEvent } from '../hotkeys/key-combo';
  import { hotkeys } from '../hotkeys';
  import { pushDismissLayer } from '../hotkeys/dismiss-layer';

  interface Props {
    /** Содержимое книги главами. */
    content: BookContent;
    /** Масштаб текста в процентах. */
    zoom: number;
    /** Начальная позиция чтения в процентах. */
    initialPosition?: number;
    /** Заметки книги для подсветки и наложений. */
    notes?: Note[];
    /** Видима ли область чтения. */
    visible?: boolean;
    /** Активный инструмент создания заметок. */
    tool?: NoteTool;
    /** Тема области чтения (светлая или тёмная). */
    readerTheme?: ReaderThemeId;
    /** Гарнитура книги: с засечками или без. */
    readerFont?: ReaderFontId;
    /** Палитра оформления: общий реестр дизайн-системы. */
    palette?: PaletteId;
    /** Выделение пользователя, ставшее цитатой. */
    onQuote?: (anchor: QuoteAnchor, color: NoteColor) => void;
    /** Клик при инструменте «текст»: запрос текстовой карточки в точке. */
    onTextPoint?: (anchor: QuoteAnchor, color: NoteColor) => void;
    /** Протяжка при инструменте «фигура»: готовая заметка-фигура. */
    onShape?: (anchor: QuoteAnchor, shape: ShapeKind, geometry: string, color: NoteColor) => void;
    /** Изменение прогресса чтения в процентах. */
    onProgress?: (percent: number) => void;
    /** Выбор существующей заметки кликом по подсветке или наложению. */
    onSelectNote?: (noteId: string) => void;
    /** Перемещение карточки/фигуры или сдвиг границ цитаты. */
    onPlaceNote?: (noteId: string, anchor: QuoteAnchor, geometry?: string) => void;
    /** Запрос правки текста заметки типа `text` (окно открывает оболочка). */
    onEditText?: (noteId: string) => void;
    /** Открытие внешней ссылки книги системным приложением. */
    onOpenLink?: (href: string) => void;
    /** Итог поиска после применения отложенного запроса (книга ещё грузилась). */
    onSearchResult?: (result: SearchResult) => void;
  }

  let {
    content,
    zoom,
    initialPosition = 0,
    notes = [],
    visible = true,
    tool = DEFAULT_NOTE_TOOL,
    readerTheme = DEFAULT_READER_THEME,
    readerFont = DEFAULT_READER_FONT,
    palette = DEFAULT_PALETTE,
    onQuote,
    onTextPoint,
    onShape,
    onProgress,
    onSelectNote,
    onPlaceNote,
    onEditText,
    onOpenLink,
    onSearchResult,
  }: Props = $props();

  /** Доступные типы заметок текучего чтения: только цитата. */
  const ALLOWED_TYPES = FLOWING_NOTE_TYPES;

  /** Область отображения книги. */
  let frame: HTMLIFrameElement | undefined = $state();
  /** Документ книги после загрузки области. */
  let doc: Document | null = $state(null);
  /** Фон области чтения по теме: убирает белую вспышку до отрисовки документа. */
  const frameBackground = $derived(readerThemeTokens(palette, readerTheme).background);
  /** Начальная позиция, взятая один раз при создании вкладки. */
  const startPosition = untrack(() => initialPosition);
  /** Опорная строка для удержания места при перестройке: диапазон и его отступ. */
  let zoomAnchor = captureAnchor(null);

  /** Разметка книги для восстановления области, ушедшей с содержимого.
   *
   * Область живёт в `srcdoc`; если браузер всё же перешёл по ссылке (например,
   * из книги с нестандартной разметкой), документ книги подменялся документом
   * приложения, и вкладка ломалась. Здесь хранится та же разметка, чтобы
   * вернуть книгу на место.
   */
  let bookHtml = '';

  /** Последняя позиция чтения в процентах: восстанавливается после возврата. */
  let lastProgress = 0;

  /** Идёт ли возврат книги после ухода области; защита от цикла возвратов. */
  let restoring = false;

  /** Незавершённое выделение для создания заметки. */
  let pendingAnchor: QuoteAnchor | null = $state(null);
  /** Позиция контекстного меню выделения (координаты области чтения). */
  let menuPosition: { x: number; y: number } | null = $state(null);
  /** Ширина и высота области чтения для удержания меню внутри неё. */
  let readerAreaWidth = $state(0);
  let readerAreaHeight = $state(0);
  /** Была ли протяжка при инструменте текста/фигуры (гасит клик выбора). */
  let dragged = false;
  /** Раздел главы текущей протяжки фигуры. */
  let dragSection: Element | null = null;
  /** Начальная точка протяжки фигуры в долях раздела. */
  let dragStart: { x: number; y: number } | null = null;
  /** Текущая точка протяжки фигуры в долях раздела. */
  let dragCurrent: { x: number; y: number } | null = null;
  /** Последняя точка протяжки в координатах документа книги. */
  let dragLastClient: { x: number; y: number } | null = null;
  /** Пунктирная рамка предпросмотра фигуры во время протяжки. */
  let dragPreview: HTMLElement | null = null;
  /** Контекстное меню заметки на странице: заметка и её экранная позиция. */
  let noteMenu: { noteId: string; x: number; y: number; type: NoteType } | null = $state(null);
  /** Открытое меню сноски: содержимое цели, маркер-источник и его позиция. */
  let footnoteMenu: {
    anchor: string;
    html: string;
    source: HTMLAnchorElement;
    x: number;
    y: number;
    bottom: number;
  } | null = $state(null);
  /** Режим правки заметки: перемещение карточки/фигуры или границы цитаты. */
  let editing: { noteId: string; mode: 'move' | 'resize' } | null = $state(null);
  /** Тяга перемещения наложения: исходное место и точка захвата. */
  let moveDrag: {
    noteId: string;
    section: Element;
    anchor: QuoteAnchor;
    geometry: ShapeGeometry | null;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null = null;
  /** Заметка в режиме перемещения: для неё показываются направляющие осей. */
  let moveGuide: { noteId: string } | null = $state(null);
  /** Счётчик обновлений направляющих перемещения (пересчёт по событиям). */
  let moveGuideTick = $state(0);
  /** Тяга границы цитаты: край и исходный якорь. */
  let resizeDrag: { noteId: string; edge: 'start' | 'end'; anchor: QuoteAnchor } | null = null;
  /** Черновое размещение заметки во время правки (до сохранения). */
  let placementDraft: { noteId: string; anchor: QuoteAnchor } | null = null;
  /** Живой черновик перемещения: новая точка и геометрия до сохранения.
   *
   * Пока идёт перетаскивание, наложение рисуется по черновику, поэтому заметка
   * следует за курсором. После отпускания черновик удерживается до прихода
   * сохранённого места: иначе заметка на миг возвращалась бы на прежнее место.
   */
  let moveDraft: { noteId: string; anchor: QuoteAnchor; geometry: string | null } | null = null;
  /** Подавление выбора заметки сразу после завершения правки. */
  let suppressClick = false;
  /** Вхождения текущего запроса поиска в порядке чтения. */
  let searchHits: SearchHit[] = $state([]);
  /** Индекс вхождения, к которому ведёт переход; `null` — перехода нет. */
  let searchActive: number | null = $state(null);
  /** Запрос, по которому построена подсветка: повтор того же запроса не ищет заново. */
  let searchQuery = '';

  /** Ограничение позиции меню внутри области чтения. */
  function menuStyle(): string {
    const menuWidth = 190;
    const menuHeight = 40;
    const x = Math.max(
      8,
      Math.min(menuPosition?.x ?? 0, Math.max(8, readerAreaWidth - menuWidth - 8)),
    );
    const preferred = menuPosition?.y ?? 0;
    const y =
      readerAreaHeight > 0 && preferred + menuHeight > readerAreaHeight
        ? Math.max(8, preferred - menuHeight - 12)
        : preferred;
    return `left: ${x}px; top: ${y}px;`;
  }

  /** Клавиши внутри документа книги: единственный реестр приложения.
   *
   * События клавиатуры из `iframe` не доходят до окна приложения, поэтому книга
   * пересылает нажатие общему диспетчеру. Собственной навигации по клавишам у
   * чтения нет: что значит `PageDown` или `Home`, решает реестр, а прокрутку
   * выполняет документ книги по команде приложения.
   */
  function handleReaderKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    // Нажатие обрабатывается реестром приложения; собственная прокрутка браузера
    // для той же клавиши отменяется, иначе страница сдвинулась бы дважды.
    if (hotkeys.handleViewer(comboOfEvent(event))) {
      event.preventDefault();
    }
  }

  /** Документ области отображения или null. */
  function document(): Document | null {
    return frame?.contentDocument ?? null;
  }
  /** Раздел главы книги по индексу. */
  function chapterSection(index: number): Element | null {
    return document()?.querySelector(`.${CHAPTER_CLASS}[data-chapter="${index}"]`) ?? null;
  }

  /** Разделы глав книги по порядку. */
  function chapterSections(): Element[] {
    return Array.from(document()?.querySelectorAll(`.${CHAPTER_CLASS}`) ?? []);
  }

  /** Место заметки-цитаты в книге: глава, диапазон и его смещения.
   *
   * Глава берётся по номеру из якоря. Если места в ней нет (книга разобрана
   * иначе, чем при создании заметки), глава ищется по тексту цитаты. Смещения
   * возвращаются вместе с диапазоном: подсветка и переход не пересчитывают
   * якорь повторно.
   */
  function resolveQuotePlace(
    anchor: QuoteAnchor,
  ): { section: Element; range: Range; start: number; end: number } | null {
    if (anchor.kind !== 'text') {
      return null;
    }
    const section = chapterSection(anchor.chapter);
    if (section) {
      const resolved = resolveAnchorRange(section, anchor);
      if (resolved) {
        return { section, range: resolved.range, start: resolved.start, end: resolved.end };
      }
    }
    for (const candidate of chapterSections()) {
      if (candidate === section) {
        continue;
      }
      const resolved = resolveAnchorRange(candidate, anchor);
      if (resolved) {
        return {
          section: candidate,
          range: resolved.range,
          start: resolved.start,
          end: resolved.end,
        };
      }
    }
    return null;
  }

  /** Применение активного инструмента к документу книги (курсор и выделение). */
  function applyTool(): void {
    const body = document()?.body as HTMLElement | null;
    if (body) {
      body.dataset.tool = tool.type;
      if (editing) {
        body.dataset.editing = editing.mode;
      } else {
        delete body.dataset.editing;
      }
    }
  }

  /** Снятие подсветок всех заметок без изменения текста. */
  function clearHighlights(): void {
    const value = document();
    if (!value) {
      return;
    }
    clearNoteMarks(value, `mark.${NOTE_CLASS}`);
  }

  /** Снятие подсветки одной заметки перед её перерисовкой. */
  function clearNoteHighlight(noteId: string): void {
    const value = document();
    if (!value) {
      return;
    }
    clearNoteMarks(value, `mark.${NOTE_CLASS}[data-note-id="${noteId}"]`);
  }

  /** Снятие наложения (карточки или фигуры) одной заметки. */
  function clearNoteOverlay(noteId: string): void {
    const value = document();
    if (!value) {
      return;
    }
    clearNoteOverlays(value, `.${NOTE_OVERLAY_CLASS}[data-note-id="${noteId}"]`);
  }

  /** Снятие наложений карточек и фигур. */
  function clearOverlays(): void {
    const value = document();
    if (!value) {
      return;
    }
    clearNoteOverlays(value, `.${NOTE_OVERLAY_CLASS}`);
  }

  /** Подсветка одной заметки-цитаты; неподходящий якорь пропускается. */
  function highlightNote(note: Note, anchorOverride?: QuoteAnchor): void {
    const value = document();
    const anchor = anchorOverride ?? parseAnchor(note.anchor);
    if (!value || !anchor || note.type !== 'quote') {
      return;
    }
    // Место разрешается по сохранённым смещениям, а при их несовпадении — по
    // тексту цитаты: заметка не пропадает в книге, разобранной иначе.
    const place = resolveQuotePlace(anchor);
    if (!place) {
      return;
    }
    highlightTextRange(place.section, place.start, place.end, NOTE_CLASS, note.id, note.color);
  }

  /** Наложение одной текстовой карточки или фигуры.
   *
   * Текучее чтение держит только цитаты: карточки и фигуры здесь не рисуются,
   * потому что их точки и геометрия неустойчивы к перестройке потока текста.
   */
  function drawOverlay(note: Note, anchorOverride?: QuoteAnchor, geometryOverride?: string): void {
    if (!ALLOWED_TYPES.includes(note.type)) {
      return;
    }
    const value = document();
    const anchor = anchorOverride ?? parseAnchor(note.anchor);
    if (!value || !anchor) {
      return;
    }
    const section = chapterSection(anchor.chapter);
    if (!section) {
      return;
    }
    if (note.type === 'text') {
      const placed: Note = anchorOverride ? { ...note, anchor: JSON.stringify(anchor) } : note;
      renderTextCard(section, placed);
    } else if (note.type === 'shape') {
      const placed: Note = geometryOverride ? { ...note, geometry: geometryOverride } : note;
      renderShape(section, placed);
    }
  }

  /** Перерисовка подсветок и наложений всех заметок.
   *
   * Полная перерисовка применяется только при входе в документ или смене
   * инструмента/правки. При обычной смене набора заметок используется
   * `syncNotes`, чтобы не снимать и не ставить заново всю разметку.
   */
  function drawNotes(): void {
    clearHighlights();
    clearOverlays();
    for (const note of notes) {
      // Живой черновик перемещения важнее черновика правки границ.
      const moving = moveDraft?.noteId === note.id ? moveDraft : null;
      const resizing = placementDraft?.noteId === note.id ? placementDraft : null;
      const override = moving?.anchor ?? resizing?.anchor;
      const geometry = moving ? (moving.geometry ?? undefined) : undefined;
      if (note.type === 'quote') {
        highlightNote(note, override);
      } else {
        drawOverlay(note, override, geometry);
      }
    }
    if (editing?.mode === 'resize') {
      renderResizeHandles();
    }
  }

  /** Инкрементальное обновление подсветок и наложений по списку заметок.
   *
   * Для каждой существующей заметки, чей якорь и цвет не изменились, разметка
   * остаётся на месте; заново рисуются только добавленные и изменившиеся, а
   * разметка удалённых снимается. Так правка имени или комментария не снимает и
   * не ставит подсветку заново (без мигания и лишних перестроек текста).
   */
  function syncNotes(previous: Note[]): void {
    const value = document();
    if (!value) {
      return;
    }
    const current = new Map(notes.map((note) => [note.id, note]));
    for (const note of previous) {
      if (!current.has(note.id)) {
        clearNoteHighlight(note.id);
        clearNoteOverlay(note.id);
      }
    }
    for (const note of notes) {
      const was = previous.find((candidate) => candidate.id === note.id);
      // Разметка зависит только от якоря, типа и цвета; прочие поля (имя,
      // комментарий) перерисовки не требуют.
      const unchanged =
        was !== undefined &&
        was.type === note.type &&
        was.anchor === note.anchor &&
        was.color === note.color;
      if (unchanged) {
        continue;
      }
      clearNoteHighlight(note.id);
      clearNoteOverlay(note.id);
      if (note.type === 'quote') {
        highlightNote(note);
      } else {
        drawOverlay(note);
      }
    }
  }

  /** Прокрутка к экранной координате цели с отступом.
   *
   * Уже видимое место не прокручивается вовсе: иначе повторный клик по заметке
   * каждый раз чуть сдвигал весь текст. Дальний переход выполняется сразу, а не
   * плавно: плавная прокрутка на десятки тысяч пикселей идёт долго и при
   * повторном клике начинается заново, поэтому до заметки было не добраться.
   */
  function scrollReaderTo(win: Window, root: Element, target: number, margin: number): void {
    const height = root.clientHeight;
    // Цель уже в поле зрения: прокрутка только сдвинула бы текст.
    if (target >= 0 && target <= height - margin) {
      return;
    }
    const top = root.scrollTop + target - margin;
    const distance = Math.abs(top - root.scrollTop);
    win.scrollTo({ top, behavior: distance > height * 1.5 ? 'auto' : 'smooth' });
  }

  /** Переход к якорю заметки с показом выделения.
   *
   * Место разрешается тем же способом, что и подсветка: сохранённые смещения
   * могут не совпасть с текстом, тогда его даёт сама цитата.
   */
  function gotoAnchor(note: Note): void {
    const value = document();
    if (!value) {
      return;
    }
    const root = value.scrollingElement ?? value.documentElement;
    const win = value.defaultView;
    const anchor = parseAnchor(note.anchor);
    const quote = anchor ? resolveQuotePlace(anchor) : null;
    const section = quote?.section ?? (anchor ? chapterSection(anchor.chapter) : null);
    if (anchor?.kind === 'point' && section) {
      // Точка: прокручиваем к её доле внутри раздела главы.
      const rect = section.getBoundingClientRect();
      const target = rect.top + rect.height * Math.max(0, Math.min(1, anchor.y ?? 0));
      if (win && root) {
        scrollReaderTo(win, root, target, 120);
      }
    } else {
      // Место цитаты разрешается тем же способом, что и подсветка: сохранённые
      // смещения могут не совпасть с текстом, тогда его даёт сама цитата.
      const target = quote?.range ?? (section ? section : null);
      if (target && win && root) {
        scrollReaderTo(win, root, target.getBoundingClientRect().top, 80);
      } else if (anchor && anchor.percent > 0) {
        gotoPercent(anchor.percent);
      }
    }
    const id = note.id;
    for (const mark of Array.from(
      value.querySelectorAll(`mark.${NOTE_CLASS}[data-note-id="${id}"]`),
    )) {
      mark.classList.add(FLASH_CLASS);
      setTimeout(() => mark.classList.remove(FLASH_CLASS), 300);
    }
    for (const overlay of Array.from(
      value.querySelectorAll(`.${NOTE_OVERLAY_CLASS}[data-note-id="${id}"]`),
    )) {
      overlay.classList.add(FLASH_CLASS);
      setTimeout(() => overlay.classList.remove(FLASH_CLASS), 300);
    }
  }

  /** Переход к главе книги из панели содержания.
   *
   * Глава адресуется своим индексом в разметке (тот же порядок, что и у
   * содержания): раздел ставится у верха области, а позиция чтения
   * запоминается для следующего открытия.
   */
  export function goToChapter(index: number): void {
    const value = document();
    if (!value) {
      return;
    }
    const section = chapterSection(index);
    const win = value.defaultView;
    const root = value.scrollingElement ?? value.documentElement;
    if (!section || !win || !root) {
      return;
    }
    const height = root.clientHeight;
    const inView = section.getBoundingClientRect().top >= 0 &&
      section.getBoundingClientRect().top <= height - 80;
    if (!inView) {
      scrollReaderTo(win, root, section.getBoundingClientRect().top, 80);
    }
    captureAnchorNow();
    handleScroll();
  }

  /** Переход к доле позиции в книге. */
  function gotoPercent(percent: number): void {
    const value = document();
    const win = value?.defaultView;
    const root = value?.scrollingElement ?? value?.documentElement;
    if (!value || !win || !root) {
      return;
    }
    const max = root.scrollHeight - root.clientHeight;
    if (max > 0) {
      win.scrollTo({ top: max * (Math.max(0, Math.min(100, percent)) / 100), behavior: 'smooth' });
    }
  }

  /** Подсветка всех найденных вхождений в документе книги.
   *
   * Подсветка ставится отдельным от заметок слоем (см. `search-mark.ts`), поэтому
   * поиск не снимает и не перестраивает разметку заметок.
   */
  function highlightSearch(): void {
    const value = document();
    if (!value) {
      return;
    }
    clearSearchHighlights(value);
    const active = searchActive === null ? null : searchHits[searchActive];
    for (const section of chapterSections()) {
      const chapter = Number((section as HTMLElement).dataset.chapter ?? '0');
      const chapterHits = searchHits.filter((hit) => hit.chapter === chapter);
      if (chapterHits.length === 0) {
        continue;
      }
      highlightSearchHits(
        section,
        chapterHits,
        active && active.chapter === chapter ? active.start : null,
      );
    }
  }

  /** Поиск по книге: найденные вхождения и их подсветка.
   *
   * Возвращает вхождения вызывающей стороне (панель поиска показывает счётчик и
   * фрагменты), а подсветку ставит в документе книги. Повторный поиск того же
   * запроса не пересобирает подсветку: места уже отмечены.
   */
  export function search(query: string): SearchResult {
    searchQuery = query.trim();
    const value = document();
    if (!value) {
      // Документ книги ещё не загружен: запрос сохраняется и применяется после
      // загрузки (см. `handleLoad`), а не теряется.
      return { hits: [], truncated: false };
    }
    if (!searchQuery) {
      searchHits = [];
      searchActive = null;
      clearSearchHighlights(value);
      return { hits: [], truncated: false };
    }
    const result = searchBook(chapterSections(), searchQuery, chapterTextOf);
    searchHits = result.hits;
    searchActive = result.hits.length > 0 ? 0 : null;
    highlightSearch();
    return result;
  }

  /** Переход к вхождению поиска по его номеру: подсветка и прокрутка к месту. */
  export function goToSearchHit(index: number): void {
    if (searchHits.length === 0) {
      return;
    }
    const target = Math.max(0, Math.min(searchHits.length - 1, index));
    searchActive = target;
    const value = document();
    if (!value) {
      return;
    }
    const hit = searchHits[target];
    const section = chapterSection(hit.chapter);
    if (section) {
      // Активное вхождение ищется в главе вхождения: смещение уникально внутри
      // главы, а не в книге.
      for (const mark of Array.from(section.querySelectorAll<HTMLElement>(`mark.${SEARCH_CLASS}`))) {
        mark.classList.toggle(SEARCH_ACTIVE_CLASS, mark.dataset.start === String(hit.start));
      }
    }
    const active = value.querySelector(`mark.${SEARCH_ACTIVE_CLASS}`) ?? null;
    const win = value.defaultView;
    const root = value.scrollingElement ?? value.documentElement;
    if (active && win && root) {
      // Место вхождения ставится на строку ниже верха области: над ним
      // остаётся контекст соседних строк, и найденное не прижато к краю.
      const rect = active.getBoundingClientRect();
      scrollReaderTo(win, root, rect.top, 120);
    }
    captureAnchorNow();
  }

  /** Снятие поиска: подсветка убирается, места вхождений забываются. */
  export function clearSearch(): void {
    searchQuery = '';
    searchHits = [];
    searchActive = null;
    const value = document();
    if (value) {
      clearSearchHighlights(value);
    }
  }
  /** Скрытие контекстного меню выделения и снятие выделения. */
  function dismissMenu(): void {
    pendingAnchor = null;
    menuPosition = null;
    document()?.getSelection()?.removeAllRanges();
  }

  /** Доля позиции точки в книге в процентах по координате вертикали. */
  function percentAt(clientY: number): number {
    const value = document();
    const win = value?.defaultView;
    const root = value?.scrollingElement ?? value?.documentElement;
    const height = root?.scrollHeight ?? 0;
    if (!win || !root || height <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, ((clientY + root.scrollTop) / height) * 100));
  }

  /** Рамка выбранной заметки в координатах области чтения (для направляющих).
   *
   * Возвращает прямоугольник и положение осей через центр: направляющие
   * показывают, что заметку можно двигать, и рисуются в оболочке поверх книги.
   */
  const moveGuideBox = $derived.by(() => {
    const value = doc;
    const target = moveGuide;
    // Счётчик читается, чтобы пересчитывать рамку при прокрутке и тяге.
    void moveGuideTick;
    if (!value || !target) {
      return null;
    }
    const note = notes.find((candidate) => candidate.id === target.noteId);
    const anchor = note ? parseAnchor(note.anchor) : null;
    const section = anchor ? chapterSection(anchor.chapter) : null;
    if (!note || !anchor || !section) {
      return null;
    }
    let left: number;
    let top: number;
    let width: number;
    let height: number;
    if (note.type === 'shape') {
      const element = value.querySelector(
        `.${NOTE_SHAPE_CLASS}[data-note-id="${note.id}"]`,
      ) as SVGGraphicsElement | null;
      const shape = element?.querySelector('line,rect,ellipse') ?? null;
      const rect = shape?.getBoundingClientRect();
      if (!rect) {
        return null;
      }
      left = rect.left;
      top = rect.top;
      width = rect.width;
      height = rect.height;
    } else {
      const element = value.querySelector(
        `.${NOTE_OVERLAY_CLASS}.${NOTE_CARD_CLASS}[data-note-id="${note.id}"]`,
      ) as HTMLElement | null;
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      left = rect.left;
      top = rect.top;
      width = rect.width;
      height = rect.height;
    }
    // Прямоугольники из документа книги уже отсчитаны от области чтения:
    // смещать их на положение кадра нельзя, иначе направляющие уезжают.
    return {
      left,
      top,
      width,
      height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    };
  });

  /** Открытие контекстного меню заметки по её элементу. */
  function openNoteMenu(noteId: string, element: Element): void {
    const note = notes.find((candidate) => candidate.id === noteId);
    if (!note) {
      return;
    }
    // У фигуры наложение — SVG во всю главу; для привязки меню к самой фигуре
    // берётся её графический элемент внутри слоя.
    const shape = element.querySelector('line,rect,ellipse');
    const rect = (shape ?? element).getBoundingClientRect();
    noteMenu = { noteId, x: rect.left, y: rect.bottom, type: note.type };
  }

  /** Закрытие контекстного меню заметки. */
  function closeNoteMenu(): void {
    noteMenu = null;
    moveGuide = null;
  }

  /** Правка текста карточки: меню закрывается, окно правки открывает оболочка.
   *
   * Модальное окно с формой заметки живёт в оболочке (`ReaderPage`), потому что
   * оно общее для встроенного чтения и плагина рабочего места. Здесь лишь
   * передаётся идентификатор правимой заметки.
   */
  function startEditNoteText(noteId: string): void {
    noteMenu = null;
    onEditText?.(noteId);
  }

  /** Начало перемещения карточки или фигуры. */
  function startMove(): void {
    if (!noteMenu) {
      return;
    }
    moveGuide = { noteId: noteMenu.noteId };
    editing = { noteId: noteMenu.noteId, mode: 'move' };
    noteMenu = null;
  }

  /** Начало сдвига границ цитаты. */
  function startResize(): void {
    if (!noteMenu) {
      return;
    }
    const note = notes.find((candidate) => candidate.id === noteMenu?.noteId);
    const anchor = note ? parseAnchor(note.anchor) : null;
    if (!note || !anchor) {
      noteMenu = null;
      return;
    }
    moveGuide = null;
    editing = { noteId: note.id, mode: 'resize' };
    resizeDrag = { noteId: note.id, edge: 'start', anchor };
    noteMenu = null;
    placementDraft = null;
    clearResizePreview();
    renderResizeHandles();
  }

  /** Остановка правки заметки со снятием подвижных маркеров. */
  function cancelEditing(): void {
    const value = document();
    value?.removeEventListener('mousemove', handleResizeMove);
    value?.removeEventListener('mouseup', handleResizeEnd);
    editing = null;
    resizeDrag = null;
    moveDrag = null;
    moveDraft = null;
    placementDraft = null;
    moveGuide = null;
    clearResizeHandles();
    clearResizePreview();
    drawNotes();
  }

  /** Снятие маркеров границ цитаты из документа книги. */
  function clearResizeHandles(): void {
    const value = document();
    for (const handle of Array.from(value?.querySelectorAll('.context-note-handle') ?? [])) {
      handle.remove();
    }
  }

  /** Отрисовка маркеров границ цитаты внутри документа книги.
   *
   * Маркеры строятся по диапазону символов текущего якоря и живут в том же
   * документе, что и текст: браузер сам ведёт протяжку через `mouseup`, как в
   * страничном формате. Маркеры не пересчитываются во время протяжки — иначе
   * текст перерисовывался бы под курсором и выделение «соскакивало»; во время
   * тяги обновляется только превью подсветки.
   */
  function renderResizeHandles(): void {
    clearResizeHandles();
    const anchor = resizeDrag?.anchor;
    const section = anchor ? chapterSection(anchor.chapter) : null;
    if (!anchor || !section) {
      return;
    }
    const startRange = rangeFromOffsets(section, Math.max(0, anchor.start), Math.max(0, anchor.start + 1));
    const endRange = rangeFromOffsets(section, Math.max(0, anchor.end - 1), Math.max(0, anchor.end));
    const startRect = rangeHandleRect(section, startRange, 'start');
    const endRect = rangeHandleRect(section, endRange, 'end');
    if (!startRect || !endRect) {
      return;
    }
    for (const [edge, rect] of [
      ['start', startRect],
      ['end', endRect],
    ] as const) {
      const handle = section.ownerDocument.createElement('div');
      handle.className = 'context-note-handle';
      handle.dataset.noteHandle = edge;
      handle.style.left = `${rect.x + (edge === 'start' ? 0 : rect.width)}px`;
      handle.style.top = `${rect.y + rect.height / 2}px`;
      section.appendChild(handle);
    }
  }

  /** Отрисовка превью подсветки при правке границ цитаты.
   *
   * Во время тяги диапазон не перестраивается: вместо снятия и повторного
   * оборачивания текста рисуются прямоугольники поверх него. Так текст под
   * курсором не пересоздаётся, `caretRangeFromPoint` работает стабильно, и
   * маркеры не дрожат.
   */
  function renderResizePreview(): void {
    const value = document();
    const draft = placementDraft;
    const anchor = draft?.anchor;
    const section = anchor ? chapterSection(anchor.chapter) : null;
    for (const box of Array.from(value?.querySelectorAll(`.${NOTE_PREVIEW_CLASS}`) ?? [])) {
      box.remove();
    }
    if (!value || !draft || !anchor || !section) {
      return;
    }
    const range = rangeFromOffsets(section, anchor.start, anchor.end);
    if (!range) {
      return;
    }
    const bounds = section.getBoundingClientRect();
    const color = NOTE_COLOR_HIGHLIGHTS[
      notes.find((note) => note.id === draft.noteId)?.color ?? DEFAULT_NOTE_COLOR
    ];
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      const box = value.createElement('div');
      box.className = NOTE_PREVIEW_CLASS;
      box.style.left = `${rect.left - bounds.left}px`;
      box.style.top = `${rect.top - bounds.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      box.style.background = color;
      section.appendChild(box);
    }
  }

  /** Снятие превью подсветки при правке границ. */
  function clearResizePreview(): void {
    const value = document();
    for (const box of Array.from(value?.querySelectorAll(`.${NOTE_PREVIEW_CLASS}`) ?? [])) {
      box.remove();
    }
  }

  /** Смещение символа в главе по координатам указателя. */
  function offsetAtPoint(section: Element, clientX: number, clientY: number): number | null {
    const value = document();
    if (!value) {
      return null;
    }
    const caret = (
      value as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
    ).caretRangeFromPoint;
    if (typeof caret !== 'function') {
      return null;
    }
    const range = caret.call(value, clientX, clientY);
    if (!range) {
      return null;
    }
    const element = (node: Node) =>
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (element(range.startContainer)?.closest('.context-chapter') !== section) {
      return null;
    }
    return charOffset(section, range.startContainer, range.startOffset);
  }

  /** Начало тяги перемещения карточки или фигуры. */
  function beginMoveDrag(event: MouseEvent): void {
    const noteId = editing?.noteId;
    const note = notes.find((candidate) => candidate.id === noteId);
    const anchor = note ? parseAnchor(note.anchor) : null;
    if (!note || !anchor) {
      return;
    }
    const section = chapterSection(anchor.chapter);
    if (!section) {
      return;
    }
    const rect = section.getBoundingClientRect();
    const geometry = note.type === 'shape' ? parseGeometry(note.geometry) : null;
    moveDrag = {
      noteId: note.id,
      section,
      anchor,
      geometry,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
    };
    moveDraft = {
      noteId: note.id,
      anchor,
      geometry: geometry ? serializeGeometry(geometry) : null,
    };
    dragged = true;
  }

  /** Живое перемещение заметки: наложение следует за курсором.
   *
   * Превью рисуется по черновику, поэтому заметка не ждёт сохранения и не
   * откатывается на прежнее место между отпусканием и ответом хранилища.
   */
  function moveNotePreview(event: MouseEvent): void {
    const drag = moveDrag;
    if (!drag) {
      return;
    }
    const dx = drag.width > 0 ? (event.clientX - drag.startX) / drag.width : 0;
    const dy = drag.height > 0 ? (event.clientY - drag.startY) / drag.height : 0;
    const anchor = createAnchor({
      ...drag.anchor,
      x: clamp01((drag.anchor.x ?? 0) + dx),
      y: clamp01((drag.anchor.y ?? 0) + dy),
    });
    const geometry = drag.geometry
      ? serializeGeometry({
          x1: clamp01(drag.geometry.x1 + dx),
          y1: clamp01(drag.geometry.y1 + dy),
          x2: clamp01(drag.geometry.x2 + dx),
          y2: clamp01(drag.geometry.y2 + dy),
        })
      : null;
    moveDraft = { noteId: drag.noteId, anchor, geometry };
    drawNotes();
  }

  /** Начало тяги маркера границы цитаты. */
  function beginResizeDrag(event: MouseEvent, edge: 'start' | 'end'): void {
    if (!editing || editing.mode !== 'resize' || !resizeDrag) {
      return;
    }
    event.preventDefault();
    resizeDrag = { ...resizeDrag, edge };
    const value = document();
    value?.addEventListener('mousemove', handleResizeMove);
    value?.addEventListener('mouseup', handleResizeEnd);
  }

  /** Обновление границ цитаты во время тяги маркера.
   *
   * Пересчитывается только превью подсветки: полный `drawNotes` снял бы и снова
   * обернул текст, и выделение под курсором «соскакивало». Новый якорь
   * сохраняется по отпусканию (`handleResizeEnd`), как в страничном формате.
   */
  function handleResizeMove(event: MouseEvent): void {
    if (!resizeDrag) {
      return;
    }
    const section = chapterSection(resizeDrag.anchor.chapter);
    if (!section) {
      return;
    }
    const point = offsetAtPoint(section, event.clientX, event.clientY);
    if (point === null) {
      return;
    }
    let start = resizeDrag.anchor.start;
    let end = resizeDrag.anchor.end;
    if (resizeDrag.edge === 'start') {
      start = Math.max(0, Math.min(point, end - 1));
    } else {
      end = Math.max(start + 1, point);
    }
    const range = rangeFromOffsets(section, start, end);
    const quote = range ? range.toString().replace(/\s+/g, ' ').trim() : resizeDrag.anchor.quote;
    const next = createAnchor({ ...resizeDrag.anchor, start, end, quote });
    placementDraft = { noteId: resizeDrag.noteId, anchor: next };
    renderResizePreview();
  }

  /** Завершение сдвига границ цитаты: сохранение нового якоря по отпусканию.
   *
   * Правка всегда завершается по отпусканию кнопки мыши: и после протяжки
   * маркера, и при клике мимо него. Отдельного подтверждения нет — поведение
   * совпадает со страничным форматом.
   */
  function handleResizeEnd(): void {
    const value = document();
    value?.removeEventListener('mousemove', handleResizeMove);
    value?.removeEventListener('mouseup', handleResizeEnd);
    clearResizePreview();
    const draft = placementDraft;
    placementDraft = null;
    if (draft) {
      resizeDrag = resizeDrag ? { ...resizeDrag, anchor: draft.anchor } : null;
      onPlaceNote?.(draft.noteId, draft.anchor);
    }
    editing = null;
    resizeDrag = null;
    clearResizeHandles();
    suppressClick = true;
    drawNotes();
  }

  /** Завершение перемещения карточки или фигуры. */
  function commitMove(event: MouseEvent): void {
    const drag = moveDrag;
    if (!drag) {
      return;
    }
    moveDrag = null;
    editing = null;
    moveGuide = null;
    const dx = drag.width > 0 ? (event.clientX - drag.startX) / drag.width : 0;
    const dy = drag.height > 0 ? (event.clientY - drag.startY) / drag.height : 0;
    const anchor = createAnchor({
      ...drag.anchor,
      x: clamp01((drag.anchor.x ?? 0) + dx),
      y: clamp01((drag.anchor.y ?? 0) + dy),
    });
    const geometry = drag.geometry
      ? serializeGeometry({
          x1: clamp01(drag.geometry.x1 + dx),
          y1: clamp01(drag.geometry.y1 + dy),
          x2: clamp01(drag.geometry.x2 + dx),
          y2: clamp01(drag.geometry.y2 + dy),
        })
      : null;
    // Черновик удерживается до прихода сохранённого места: иначе заметка на миг
    // вернулась бы на прежнее место, пока хранилище не ответит.
    moveDraft = { noteId: drag.noteId, anchor, geometry };
    drawNotes();
    onPlaceNote?.(drag.noteId, anchor, geometry ?? undefined);
  }

  /** Начало жеста: запоминается точка отсчёта для фигуры или карточки. */
  function handleGestureStart(event: MouseEvent): void {
    if (editing?.mode === 'move') {
      // В режиме перемещения заметка хватается из любой точки своей рамки, а не
      // только по контуру: у прямоугольника и эллипса заливка прозрачна для
      // указателя, и нажатие в середине попадало в текст — начиналось выделение
      // и всплывало меню создания цитаты, хотя ожидалось перемещение.
      event.preventDefault();
      const target = event.target as Element | null;
      const overlay = target?.closest?.(`.${NOTE_OVERLAY_CLASS}`) as HTMLElement | null;
      const box = moveGuideBox;
      const insideFrame =
        !!box &&
        event.clientX >= box.left &&
        event.clientX <= box.left + box.width &&
        event.clientY >= box.top &&
        event.clientY <= box.top + box.height;
      if (overlay?.dataset.noteId === editing.noteId || insideFrame) {
        beginMoveDrag(event);
      } else {
        // Нажатие вне заметки завершает режим перемещения.
        cancelEditing();
      }
      return;
    }
    // Во время правки создание новых заметок не начинается.
    if (editing) {
      return;
    }
    // Текучее чтение создаёт только цитаты: жесты текста и фигуры недоступны.
    if (!ALLOWED_TYPES.includes(tool.type)) {
      return;
    }
    if (tool.type !== 'shape' && tool.type !== 'text') {
      return;
    }
    // Клик по существующей заметке не создаёт новую.
    const target = event.target as Element | null;
    if (target?.closest?.(`mark.${NOTE_CLASS}, .${NOTE_OVERLAY_CLASS}`)) {
      return;
    }
    const section = chapterAt(document(), event.clientX, event.clientY);
    if (!section) {
      return;
    }
    // Протяжка инструмента не должна выделять текст книги под собой.
    event.preventDefault();
    dragSection = section;
    dragStart = pointFraction(section, event.clientX, event.clientY);
    dragCurrent = { ...dragStart };
    dragLastClient = { x: event.clientX, y: event.clientY };
    dragged = false;
    if (tool.type === 'shape') {
      dragPreview = createDragPreview(section);
    }
  }

  /** Создание пунктирной рамки предпросмотра фигуры внутри раздела главы.
   *
   * Без предпросмотра протяжка выглядела «слепой»: до отпускания кнопки на
   * странице не было никаких признаков будущей фигуры (в PDF такая рамка есть).
   */
  function createDragPreview(section: Element): HTMLElement {
    const doc = section.ownerDocument;
    const preview = doc.createElement('div');
    preview.className = 'context-note-preview';
    section.appendChild(preview);
    return preview;
  }

  /** Обновление рамки предпросмотра по текущей точке протяжки. */
  function updateDragPreview(): void {
    if (!dragPreview || !dragSection || !dragStart || !dragCurrent) {
      return;
    }
    const rect = dragSection.getBoundingClientRect();
    const left = Math.min(dragStart.x, dragCurrent.x) * rect.width;
    const top = Math.min(dragStart.y, dragCurrent.y) * rect.height;
    const width = Math.abs(dragCurrent.x - dragStart.x) * rect.width;
    const height = Math.abs(dragCurrent.y - dragStart.y) * rect.height;
    dragPreview.style.left = `${left}px`;
    dragPreview.style.top = `${top}px`;
    dragPreview.style.width = `${width}px`;
    dragPreview.style.height = `${height}px`;
  }

  /** Снятие рамки предпросмотра протяжки. */
  function clearDragPreview(): void {
    if (dragPreview) {
      dragPreview.remove();
      dragPreview = null;
    }
  }

  /** Обновление протяжки фигуры. */
  function handleGestureMove(event: MouseEvent): void {
    if (moveDrag) {
      moveNotePreview(event);
      return;
    }
    if (!dragSection || !dragStart) {
      return;
    }
    dragCurrent = pointFraction(dragSection, event.clientX, event.clientY);
    dragLastClient = { x: event.clientX, y: event.clientY };
    dragged = true;
    updateDragPreview();
  }

  /** Завершение жеста: создание фигуры или точки текстовой карточки. */
  function handleGestureEnd(event: MouseEvent): void {
    if (moveDrag) {
      commitMove(event);
      suppressClick = true;
      return;
    }
    finishShapeOrTextGesture(event.clientY);
  }

  /** Завершение жеста протяжки фигуры или точки карточки по известным точкам.
   *
   * Вызывается и с отпусканием кнопки над областью чтения, и при отпускании вне
   * неё: тогда точка берётся из последнего движения внутри области, а не из
   * координат за её пределами, поэтому рамка предпросмотра не остаётся, а жест
   * всегда завершается.
   */
  function finishShapeOrTextGesture(fallbackY: number): void {
    const section = dragSection;
    const start = dragStart;
    const lastClient = dragLastClient;
    dragSection = null;
    dragStart = null;
    dragCurrent = null;
    dragLastClient = null;
    clearDragPreview();
    if (tool.type === 'shape') {
      const end = section && start && lastClient
        ? pointFraction(section, lastClient.x, lastClient.y)
        : start;
      if (!section || !start || !end) {
        dragged = false;
        return;
      }
      // Пустой жест (нажатие без перемещения) фигуру не создаёт.
      const moved = Math.abs(end.x - start.x) > 0.005 || Math.abs(end.y - start.y) > 0.005;
      if (!moved) {
        dragged = false;
        return;
      }
      const chapter = Number((section as HTMLElement).dataset.chapter ?? '0');
      const anchor = createAnchor({
        kind: 'point',
        chapter: Number.isFinite(chapter) ? chapter : 0,
        x: start.x,
        y: start.y,
        percent: percentAt(lastClient?.y ?? fallbackY),
      });
      onShape?.(
        anchor,
        tool.shape,
        serializeGeometry({ x1: start.x, y1: start.y, x2: end.x, y2: end.y }),
        tool.color,
      );
      return;
    }
    // Карточка ставится только когда жест начался на пустом месте страницы:
    // клик по существующей заметке (её выбор или перемещение) новой не создаёт.
    if (tool.type === 'text' && !dragged && section && start) {
      const chapter = Number((section as HTMLElement).dataset.chapter ?? '0');
      const anchor = createAnchor({
        kind: 'point',
        chapter: Number.isFinite(chapter) ? chapter : 0,
        x: start.x,
        y: start.y,
        percent: percentAt(lastClient?.y ?? fallbackY),
      });
      onTextPoint?.(anchor, tool.color);
    }
    dragged = false;
  }

  /** Обработка выделения пользователя: подготовка меню создания заметки. */
  function handleMouseUp(): void {
    const value = document();
    const selection = value?.getSelection();
    if (!value || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      pendingAnchor = null;
      menuPosition = null;
      return;
    }
    const range = selection.getRangeAt(0);
    const element = (node: Node) =>
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const start = element(range.startContainer)?.closest('.context-chapter');
    const end = element(range.endContainer)?.closest('.context-chapter');
    if (!start || start !== end) {
      pendingAnchor = null;
      menuPosition = null;
      return;
    }
    const offsets = offsetsFromRange(start, range);
    const quote = range.toString().replace(/\s+/g, ' ').trim();
    if (!offsets || !quote) {
      pendingAnchor = null;
      menuPosition = null;
      return;
    }
    const rect = range.getBoundingClientRect();
    // Меню ставится у конца выделения (где курсор после протяжки): у рамки
    // всего диапазона левый край — это левый отступ страницы, и при выделении
    // в несколько строк меню уезжало к краю области, а не к курсору.
    const endRects = range.getClientRects();
    const endRect = endRects.length > 0 ? endRects[endRects.length - 1] : rect;
    const win = value.defaultView;
    const root = value.scrollingElement ?? value.documentElement;
    const height = root?.scrollHeight ?? 0;
    const percent =
      win && root && height > 0
        ? Math.max(0, Math.min(100, ((rect.top + root.scrollTop) / height) * 100))
        : 0;
    const chapter = Number((start as HTMLElement).dataset.chapter ?? '0');
    pendingAnchor = createAnchor({
      chapter: Number.isFinite(chapter) ? chapter : 0,
      start: offsets.start,
      end: offsets.end,
      quote,
      percent,
      page: null,
    });
    const width = win?.innerWidth ?? 0;
    menuPosition = {
      x: Math.max(8, Math.min(endRect.right, Math.max(8, width - 180))),
      y: Math.max(8, endRect.bottom + 6),
    };  }

  /** Создание заметки-цитаты по текущему выделению заданным цветом. */
  function confirmQuote(color: NoteColor): void {
    const anchor = pendingAnchor;
    dismissMenu();
    if (anchor) {
      onQuote?.(anchor, color);
    }
  }

  /** Обработка клика по подсветке или наложению: выбор заметки и меню действий. */
  function handleClick(event: MouseEvent): void {
    // Ссылка книги перехватывается всегда: документ живёт в `srcdoc`, и
    // браузер разрешает относительные ссылки от документа родителя — клик по
    // сноске уводил область на само приложение и ломал вкладку.
    if (handleBookLink(event)) {
      return;
    }
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (dragged && (tool.type === 'text' || tool.type === 'shape')) {
      // Только что завершённая протяжка не должна выбирать заметку.
      dragged = false;
      return;
    }
    const target = event.target as HTMLElement | SVGElement | null;
    const mark = target?.closest?.(`mark.${NOTE_CLASS}`) as HTMLElement | null;
    const overlay = target?.closest?.(`.${NOTE_OVERLAY_CLASS}`) as HTMLElement | null;
    const element = mark ?? overlay;
    const noteId = element?.dataset.noteId;
    if (noteId && element) {
      onSelectNote?.(noteId);
      openNoteMenu(noteId, element);
    }
  }

  /** Переход по ссылке книги; `true` — клик был ссылкой и обработан здесь.
   *
   * Внутренний якорь прокручивает к цели, внешняя ссылка открывается системным
   * приложением, относительный путь внутри книги игнорируется. Сноска вместо
   * немедленного перехода открывает меню: короткий текст читается рядом с
   * местом чтения, а переход остаётся отдельным действием. Ссылка возврата «↩»
   * внутри сноски ведёт назад к её маркеру. Нативное поведение браузера
   * отменяется всегда, иначе область ушла бы с содержимого книги на документ
   * родителя.
   */
  function handleBookLink(event: MouseEvent): boolean {
    const target = event.target as Element | null;
    const link = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    // Ссылка возврата добавлена читалкой: она ведёт к маркеру сноски.
    if (link.classList.contains(FOOTNOTE_BACK_CLASS)) {
      const value = doc ?? document();
      const id = (link.getAttribute('href') ?? '').replace(/^#/, '');
      const source = value && id ? anchorTarget(value, id) : null;
      if (source) {
        source.scrollIntoView({ block: 'center' });
        source.classList.add(FOOTNOTE_FLASH_CLASS);
        setTimeout(() => source.classList.remove(FOOTNOTE_FLASH_CLASS), 600);
        captureAnchorNow();
        handleScroll();
      }
      return true;
    }
    const parsed = parseBookLink(link.getAttribute('href'));
    if (parsed.kind === 'anchor' && parsed.anchor) {
      const value = doc ?? document();
      const footnote = value ? bookFootnote(link, value) : null;
      if (footnote && value) {
        // Повторный клик по тому же маркеру закрывает меню.
        if (footnoteMenu && footnoteMenu.source === link) {
          footnoteMenu = null;
        } else {
          openFootnoteMenu(link, footnote.target, footnote.anchor);
        }
        return true;
      }
      const goal = value ? anchorTarget(value, parsed.anchor) : null;
      if (goal) {
        goal.scrollIntoView({ block: 'start' });
        captureAnchorNow();
        handleScroll();
      }
      return true;
    }
    if (parsed.kind === 'external') {
      onOpenLink?.(parsed.href);
      return true;
    }
    return true;
  }

  /** Открытие меню сноски у её маркера. */
  function openFootnoteMenu(link: HTMLAnchorElement, target: HTMLElement, anchor: string): void {
    const rect = link.getBoundingClientRect();
    footnoteMenu = {
      anchor,
      html: footnoteContentHtml(target),
      source: link,
      x: rect.left,
      y: rect.top,
      bottom: rect.bottom,
    };
  }

  /** Закрытие меню сноски. */
  function closeFootnoteMenu(): void {
    footnoteMenu = null;
  }

  /** Переход к сноске из меню: книга встаёт на текст, меню закрывается. */
  function gotoFootnote(): void {
    const menu = footnoteMenu;
    const value = document();
    footnoteMenu = null;
    if (!menu || !value) {
      return;
    }
    const target = anchorTarget(value, menu.anchor);
    if (!target) {
      return;
    }
    target.scrollIntoView({ block: 'start' });
    captureAnchorNow();
    handleScroll();
  }

  /** Отмена меню и правки при начале нового взаимодействия с текстом. */
  function handleMouseDown(event: MouseEvent): void {
    if (pendingAnchor) {
      pendingAnchor = null;
      menuPosition = null;
    }
    if (noteMenu) {
      noteMenu = null;
    }
    if (footnoteMenu) {
      // Нажатие по маркеру открытой сноски меню не снимает: клик по нему
      // переключает меню (см. `openFootnoteMenu`).
      const target = event.target as Element | null;
      const link = target?.closest?.('a[href]');
      if (!link || link !== footnoteMenu.source) {
        footnoteMenu = null;
      }
    }
    if (editing && editing.mode === 'resize') {
      const target = event.target as Element | null;
      const handle = target?.closest?.('[data-note-handle]') as Element | null;
      if (handle) {
        beginResizeDrag(event, handle.getAttribute('data-note-handle') === 'start' ? 'start' : 'end');
        return;
      }
      // Клик по тексту вне маркеров завершает правку границ.
      handleResizeEnd();
    }
  }

  /** Отмена меню при снятии выделения и перерисовка признака выделения.
   *
   * Слой активного выделения рисуется при каждом изменении выделения: он
   * показывает, что это живое выделение, а не подсветка заметки. Снятие выделения
   * снимает и слой.
   */
  function handleSelectionChange(): void {
    const value = document();
    const selection = value?.getSelection();
    const range =
      value && selection && !selection.isCollapsed && selection.rangeCount > 0
        ? selection.getRangeAt(0)
        : null;
    renderSelectionLayer(value, range);
    // Новое выделение — новое взаимодействие: меню сноски снимается.
    if (range && footnoteMenu) {
      footnoteMenu = null;
    }
    if (!pendingAnchor) {
      return;
    }
    if (!selection || selection.isCollapsed) {
      pendingAnchor = null;
      menuPosition = null;
    }
  }

  /** Захват опорной строки: читаемое место остаётся на экране при перестройке.
   *
   * Опорой служит живой диапазон второй видимой строки: пока строка живёт в
   * документе, её позиция восстанавливается точно — до браузерного reflow,
   * который смещал бы текст при изменении ширины или масштаба.
   */
  function captureAnchorNow(): void {
    zoomAnchor = captureAnchor(doc ?? document());
  }

  /** Восстановление захваченной опорной строки после перестройки текста. */
  function restoreAnchorNow(): void {
    restoreAnchor(doc ?? document(), zoomAnchor);
  }

  /** Скрытие меню при прокрутке книги и обновление опорной строки. */
  function handleDocumentScroll(): void {
    if (pendingAnchor) {
      pendingAnchor = null;
      menuPosition = null;
    }
    if (footnoteMenu) {
      footnoteMenu = null;
    }
    handleScroll();
    captureAnchorNow();
  }

  /** Удержание читаемого места при изменении ширины области (например, панелью). */
  function handleResize(): void {
    restoreAnchorNow();
    handleScroll();
    captureAnchorNow();
  }

  /** Отчёт о позиции чтения при прокрутке. */
  function handleScroll(): void {
    if (!visible) {
      return;
    }
    const value = document();
    const root = value?.scrollingElement ?? value?.documentElement;
    if (!value || !root) {
      return;
    }
    const max = root.scrollHeight - root.clientHeight;
    const percent = max > 0 ? (root.scrollTop / max) * 100 : 0;
    lastProgress = percent;
    onProgress?.(percent);
  }

  /** Прокрутка книги на экран вверх или вниз (`reader.screen.*`).
   *
   * Прокрутка принадлежит документу книги: только он знает высоту области
   * чтения внутри `iframe`. Клавиша и кнопка передают сюда одно и то же, поэтому
   * навигация по текстовой книге не расходится.
   */
  export function scrollScreen(direction: 1 | -1): void {
    const value = document();
    const win = value?.defaultView;
    if (!win) {
      return;
    }
    win.scrollBy({ top: direction * (win.innerHeight || 0), behavior: 'auto' });
    if (noteMenu) {
      noteMenu = null;
    }
    if (editing) {
      cancelEditing();
    }
  }

  /** Прокрутка книги к началу или концу (`reader.book.start`/`reader.book.end`). */
  export function scrollToEdge(edge: 'start' | 'end'): void {
    const value = document();
    const win = value?.defaultView;
    const root = value?.scrollingElement ?? value?.documentElement;
    if (!win || !root) {
      return;
    }
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    win.scrollTo({ top: edge === 'start' ? 0 : max, behavior: 'auto' });
    if (noteMenu) {
      noteMenu = null;
    }
    if (editing) {
      cancelEditing();
    }
  }

  /** Переход к заметке извне (панель заметок). */
  export function goto(note: Note): void {

    // Переход к другой заметке — новое взаимодействие: меню и правка снимаются.
    if (noteMenu) {
      noteMenu = null;
    }
    if (editing) {
      cancelEditing();
    }
    gotoAnchor(note);
  }

  /** Признак того, что загруженный документ — книга, а не чужой документ.
   *
   * Книга всегда содержит разделы глав. Если их нет, область ушла на другой
   * адрес: тогда содержимое возвращается, а пользователь не теряет состояние
   * чтения.
   */
  function isBookDocument(value: Document | null): boolean {
    if (!value) {
      return false;
    }
    if (!value.querySelector(`.${CHAPTER_CLASS}`)) {
      return false;
    }
    return true;
  }

  /** Возврат документа книги на прежнее место после ухода области.
   *
   * Разметка книги ставится заново, а прокрутка восстанавливается по последней
   * позиции чтения. Ошибка возврата не роняет вкладку: область остаётся как
   * есть, и книга открывается заново из неё же.
   */
  function restoreBook(): void {
    // Повторный сбой возврата не зацикливает загрузку: книга остаётся как
    // есть, а пользователь не теряет вкладку и может открыть её заново.
    if (!frame || !bookHtml || restoring) {
      return;
    }
    restoring = true;
    const percent = lastProgress;
    frame.srcdoc = bookHtml;
    frame.addEventListener(
      'load',
      () => {
        restoring = false;
        if (!isBookDocument(document())) {
          return;
        }
        handleLoad();
        if (percent > 0) {
          gotoPercent(percent);
        }
      },
      { once: true },
    );
  }

  /** Первичная настройка документа после загрузки области. */
  function handleLoad(): void {
    const value = document();
    if (!isBookDocument(value)) {
      // Область ушла с содержимого книги: возвращаем книгу, а не оставляем
      // сломанную вкладку, которую можно починить только повторным открытием.
      // Книга без глав (пустая разметка) возврату не подлежит.
      if (bookHtml.includes(CHAPTER_CLASS)) {
        restoreBook();
      }
      return;
    }
    doc = value;
    if (!value) {
      return;
    }
    // Новая загрузка документа — новая книга: прежнее меню сноски не должно
    // оставаться от прошлой разметки.
    footnoteMenu = null;
    value.addEventListener('mouseup', handleMouseUp);
    value.addEventListener('mousedown', handleMouseDown);
    value.addEventListener('click', handleClick);
    value.addEventListener('selectionchange', handleSelectionChange);
    value.addEventListener('scroll', handleDocumentScroll, { passive: true });
    value.addEventListener('mousedown', handleGestureStart);
    value.addEventListener('mousemove', handleGestureMove);
    value.addEventListener('mouseup', handleGestureEnd);
    value.addEventListener('keydown', handleReaderKeydown);
    value.defaultView?.addEventListener('resize', handleResize);
    applyReaderTheme(readerTheme, value.documentElement);
    applyReaderPalette(palette, value.documentElement);
    applyZoom(value, zoom);
    applyTool();
    if (startPosition > 0) {
      gotoPercent(startPosition);
    }
    clearSelectionLayer(value);
    drawNotes();
    // Поиск переживает перезагрузку документа книги (возврат области после
    // ухода): прежний запрос применяется к новой разметке заново.
    if (searchQuery) {
      // После пересборки документа подсветка строится заново: прежняя разметка
      // ушла вместе со старым документом.
      onSearchResult?.(search(searchQuery));
    }
    // К каждой сноске книги добавляется ссылка возврата к её маркеру: возврат
    // есть у всех сносок, а не только у последней нажатой.
    installFootnoteReturns(value);
    handleScroll();
    captureAnchorNow();
  }

  /** Документ книги собирается один раз при загрузке.
   *
   * Тема области чтения и палитра задаются при сборке, но сторона темы живёт
   * атрибутом на корне документа и переключается без пересборки (см. `$effect`
   * ниже): смена темы не сбрасывает позицию чтения и уже построенную разметку
   * заметок.
   */
  let html = $state('');
  onMount(() => {
    html = buildDocument(content, { palette, readerTheme, readerFont });
    bookHtml = html;
    /** Завершение протяжки фигуры при отпускании кнопки вне области чтения.
     *
     * `mouseup` внутри документа книги не приходит, если курсор вышел за пределы
     * iframe (например, на панель заметок): тогда жест оставался незавершённым —
     * висела рамка предпросмотра, а следующая протяжка начиналась со старых
     * точек. Обработчик окна приложения ловит отпускание в любом месте.
     */
    const onWindowMouseUp = () => {
      if (resizeDrag && placementDraft) {
        // Отпускание ушло за пределы iframe: правка границ тоже завершается.
        handleResizeEnd();
        return;
      }
      if (!dragSection || moveDrag) {
        return;
      }
      finishShapeOrTextGesture(0);
    };
    window.addEventListener('mouseup', onWindowMouseUp, true);
    return () => window.removeEventListener('mouseup', onWindowMouseUp, true);
  });

  /** Применение внешнего масштаба. */
  $effect(() => {
    const value = zoom;
    if (doc) {
      applyZoom(doc, value);
      // Перестройка текста сдвигает прямоугольники: слой выделения устаревает.
      clearSelectionLayer(doc);
      captureAnchorNow();
    }
  });

  /** Применение темы и палитры области чтения к документу книги.
   *
   * Сторона темы и палитра ставятся атрибутами на корне документа и не требуют
   * пересборки содержимого: позиция чтения и разметка заметок сохраняются.
   * Переменные всех палитр и обеих сторон заданы в стиле документа
   * (см. `reader-document.ts`).
   */
  $effect(() => {
    const value = readerTheme;
    const paletteValue = palette;
    const fontValue = readerFont;
    if (doc) {
      applyReaderTheme(value, doc.documentElement);
      applyReaderPalette(paletteValue, doc.documentElement);
      // Гарнитура ставится атрибутом: перестройка текста не нужна, позиция
      // чтения и подсветки заметок сохраняются.
      applyReaderFont(fontValue, doc.documentElement);
    }
  });

  /** Инкрементальное обновление разметки при смене заметок.
   *
   * При первой отрисовке после загрузки документа строится вся разметка; далее
   * перерисовываются только изменившиеся заметки (см. `syncNotes`). Это убирает
   * мигание и полную перестройку текста при правке имени или комментария.
   */
  let syncedNotes: Note[] = [];
  let notesSynced = false;
  $effect(() => {
    const value = notes;
    if (!doc) {
      return;
    }
    if (!notesSynced) {
      drawNotes();
      notesSynced = true;
    } else {
      syncNotes(syncedNotes);
    }
    syncedNotes = value;
    captureAnchorNow();
  });

  /** Снятие черновика перемещения после прихода сохранённого места.
   *
   * Заметки обновляются после сохранения, поэтому черновик (который удерживал
   * позицию, пока хранилище отвечало) снимается только когда сохранённое место
   * совпало с черновиком — иначе он снялся бы сразу и заметка мигнула.
   */
  $effect(() => {
    const value = notes;
    untrack(() => {
      const draft = moveDraft;
      if (!draft) {
        return;
      }
      const note = value.find((candidate) => candidate.id === draft.noteId);
      if (!note) {
        return;
      }
      const anchor = parseAnchor(note.anchor);
      const sameAnchor =
        anchor !== null &&
        Math.abs((anchor.x ?? 0) - (draft.anchor.x ?? 0)) < 1e-6 &&
        Math.abs((anchor.y ?? 0) - (draft.anchor.y ?? 0)) < 1e-6;
      const savedGeometry = note.geometry ?? '';
      const draftGeometry = parseGeometry(draft.geometry);
      const storedGeometry = parseGeometry(savedGeometry);
      const sameGeometry =
        draft.geometry === null ||
        (draftGeometry !== null &&
          storedGeometry !== null &&
          Math.abs(draftGeometry.x1 - storedGeometry.x1) < 1e-6 &&
          Math.abs(draftGeometry.y1 - storedGeometry.y1) < 1e-6 &&
          Math.abs(draftGeometry.x2 - storedGeometry.x2) < 1e-6 &&
          Math.abs(draftGeometry.y2 - storedGeometry.y2) < 1e-6);
      if (sameAnchor && sameGeometry) {
        moveDraft = null;
      }
    });
  });

  /** Смена инструмента или режима правки меняет курсор содержимого. */
  $effect(() => {
    const value = tool.type;
    const mode = editing?.mode ?? null;
    if (doc) {
      void value;
      void mode;
      applyTool();
    }
  });

  /** Сброс меню и правки заметки при взаимодействии вне меню.
   *
   * Меню и правка живут в документе приложения, поэтому клики по панели заметок
   * или панели инструментов доходят сюда. Любое взаимодействие вне меню, Escape,
   * смена инструмента и уход области закрывают меню и завершают правку —
   * случайное нажатие не попадает в уже ненужное меню.
   */
  $effect(() => {
    if (!noteMenu && !editing && !footnoteMenu) {
      return;
    }
    /** Закрытие меню и завершение правки. */
    const dismiss = () => {
      if (noteMenu) {
        noteMenu = null;
      }
      if (footnoteMenu) {
        footnoteMenu = null;
      }
      if (editing) {
        cancelEditing();
      }
    };
    /** Клик вне меню заметки закрывает его и завершает правку. */
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('[data-testid="note-menu"]')) {
        return;
      }
      if (target?.closest?.('[data-testid="footnote-menu"]')) {
        return;
      }
      dismiss();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    // Escape приходит от общего диспетчера действий, а не от собственного
    // обработчика: слой сообщает о себе, пока открыт, и закрывается в порядке
    // появления — меню заметки уходит раньше поиска, открытого до него.
    const removeLayer = pushDismissLayer(dismiss);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      removeLayer();
    };
  });

  /** Уход области из вида снимает меню и правку. */
  $effect(() => {
    if (visible) {
      return;
    }
    if (noteMenu) {
      noteMenu = null;
    }
    if (footnoteMenu) {
      footnoteMenu = null;
    }
    if (editing) {
      cancelEditing();
    }
  });

  /** Пересчёт направляющих перемещения по событиям, а не покадрово.
   *
   * Положение рамки выбранной заметки зависит от прокрутки книги и от тяги;
   * рамка пересчитывается при этих событиях (счётчик `moveGuideTick`), а не
   * каждый кадр, что убирает постоянный `requestAnimationFrame` при правке.
   */
  $effect(() => {
    const active = editing?.mode === 'move';
    if (!active) {
      moveGuideTick = 0;
      return;
    }
    const value = document();
    const win = value?.defaultView;
    /** Обновление рамки направляющих на очередном событии перемещения/прокрутки. */
    const refresh = () => {
      moveGuideTick += 1;
    };
    win?.addEventListener('scroll', refresh, { passive: true });
    value?.addEventListener('mousemove', refresh);
    window.addEventListener('mousemove', refresh);
    return () => {
      win?.removeEventListener('scroll', refresh);
      value?.removeEventListener('mousemove', refresh);
      window.removeEventListener('mousemove', refresh);
    };
  });
</script>

<div
  class="relative h-full w-full"
  bind:clientWidth={readerAreaWidth}
  bind:clientHeight={readerAreaHeight}
>
  <iframe
    bind:this={frame}
    class="h-full w-full border-0"
    style="background: {frameBackground}"
    title={t('app.reader.reading')}
    srcdoc={html}
    onload={handleLoad}
  ></iframe>

  {#if footnoteMenu}
    <FootnoteMenu
      html={footnoteMenu.html}
      at={{ left: footnoteMenu.x, top: footnoteMenu.y, bottom: footnoteMenu.bottom }}
      area={{ width: readerAreaWidth, height: readerAreaHeight }}
      {palette}
      {readerTheme}
      onGoto={gotoFootnote}
      onClose={closeFootnoteMenu}
    />
  {/if}

  {#if menuPosition && pendingAnchor}
    <div
      class="absolute z-[var(--layer-popup)] flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--overlay-surface)] p-[0.25rem] shadow-overlay"
      data-testid="quote-menu"
      style={menuStyle()}
    >
      <NoteColorMenu labelPrefix={t('app.reader.note.createPrefix')} onpick={confirmQuote} />
      <Button
        variant="ghost"
        size="icon"
        title={t('app.reader.cancel')}
        ariaLabel={t('app.reader.cancel')}
        onclick={dismissMenu}
      >
        <Icon name="close" />
      </Button>
    </div>
  {/if}

  {#if noteMenu}
    <NoteMenu
      type={noteMenu.type}
      quote={notes.find((note) => note.id === noteMenu?.noteId)?.quote ?? ''}
      at={{ left: noteMenu.x, top: noteMenu.y, bottom: noteMenu.y }}
      area={{ width: readerAreaWidth, height: readerAreaHeight }}
      onMove={startMove}
      onResize={startResize}
      onEditText={() => startEditNoteText(noteMenu!.noteId)}
      onClose={closeNoteMenu}
    />
  {/if}

  {#if moveGuideBox}
    <div
      class="pointer-events-none absolute z-[15]"
      data-testid="note-move-guide"
      style="left: {moveGuideBox.left}px; top: {moveGuideBox.top}px; width: {moveGuideBox.width}px; height: {moveGuideBox.height}px;"
    >
      <div
        class="absolute inset-0 rounded-sm border-2 border-dashed border-[var(--primary)] bg-[var(--primary-soft)]"
      ></div>
      <div
        class="absolute top-1/2 left-0 h-px w-full bg-[var(--primary)] opacity-70"
      ></div>
      <div
        class="absolute top-0 left-1/2 h-full w-px bg-[var(--primary)] opacity-70"
      ></div>
    </div>
  {/if}
</div>
