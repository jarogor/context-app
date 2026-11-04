<script lang="ts">
  import { currentLocale } from '@context/i18n';
  import { t } from '@context/i18n';
  import { onMount, untrack } from 'svelte';
  import {
    loadWorkplaceBundle,
    openBookFile,
    openBookLink,
    readBookContent,
    readWorkplaceBook,
    encodeText,
  } from './reader';
  import { buildViewerDocument } from './viewer-bundle';
  import type { Note, NoteColor, NoteTool, ShapeKind } from '../notes/notes';
  import { DEFAULT_NOTE_TOOL } from '../notes/notes';
  import type { QuoteAnchor } from './reader/anchor';
  import type { FileAnnotationBatch, FileBookmark, FileChapter } from './file-properties';
  import type { WorkplaceThumbnail } from './workplace-protocol';
  import {
    WORKPLACE_CHANNEL,
    buildReaderThemeMessage,
    isWorkplaceMessage,
    parseViewerMessage,
    type WorkplaceCapabilities,
    type WorkplaceNoteMenu,
    type WorkplaceFootnote,
    type WorkplaceSearchResult,
    type WorkplaceState,
  } from './workplace-protocol';
  import {
    DEFAULT_PALETTE,
    DEFAULT_READER_FONT,
    DEFAULT_READER_THEME,
    readerFontFamily,
    readerThemeTokens,
    solidNoteTones,
    type PaletteId,
    type ReaderFontId,
    type ReaderThemeId,
  } from '@context/ui';
  import { viewerBindingsMessage, viewerCommand } from '../hotkeys/viewer-keys';
  import { hotkeys } from '../hotkeys';

  interface Props {
    /** Идентификатор плагина рабочего места. */
    pluginId: string;
    /** Путь к файлу открытой книги (вложение вкладки). */
    path: string;
    /** Название открытой книги. */
    title: string;
    /** Текущий масштаб отображения в процентах. */
    zoom: number;
    /** Начальная позиция чтения в процентах. */
    initialPosition?: number;
    /** Заметки книги (непрозрачные якоря плагину). */
    notes?: Note[];
    /** Активный инструмент создания заметок. */
    tool?: NoteTool;
    /** Тема области чтения (светлая или тёмная). */
    readerTheme?: ReaderThemeId;
    /** Гарнитура книги: с засечками или без. */
    readerFont?: ReaderFontId;
    /** Палитра оформления: общий реестр дизайн-системы. */
    palette?: PaletteId;
    /** Видима ли область чтения (для доведения отрисовки после возврата). */
    visible?: boolean;
    /** Возможности плагина, сообщённые после загрузки. */
    onCapabilities?: (capabilities: WorkplaceCapabilities) => void;
    /** Состояние позиции: страница и их общее число. */
    onState?: (state: WorkplaceState) => void;
    /** Прогресс чтения в процентах. */
    onProgress?: (value: number) => void;
    /** Прогресс загрузки содержимого в процентах (`null` — загрузка завершена). */
    onLoadProgress?: (value: number | null) => void;
    /** Выделение пользователя, ставшее якорем заметки (с экранной позицией). */
    onSelection?: (anchor: QuoteAnchor, position: { x: number; y: number }) => void;
    /** Выделение снято: меню создания заметки следует закрыть. */
    onSelectionCleared?: () => void;
    /** Точка создания текстовой карточки, выбранная в книге. */
    onTextPoint?: (anchor: QuoteAnchor, color: NoteColor) => void;
    /** Готовая заметка-фигура, нарисованная в книге. */
    onShape?: (anchor: QuoteAnchor, shape: ShapeKind, geometry: string, color: NoteColor) => void;
    /** Клик по подсветке заметки: открыть панель и выбрать заметку. */
    onNoteClick?: (noteId: string) => void;
    /** Открытие контекстного меню заметки: прямоугольник в координатах области. */
    onNoteMenu?: (menu: WorkplaceNoteMenu) => void;
    /** Закрытие контекстного меню заметки. */
    onNoteMenuClose?: () => void;
    /** Перемещение заметки или сдвиг границ цитаты (страничные форматы). */
    onPlaceNote?: (noteId: string, anchor: QuoteAnchor, geometry?: string) => void;
    /** Ошибка отображения содержимого. */
    onError?: (message: string) => void;
    /** Результат поиска по содержимому книги. */
    onSearch?: (result: WorkplaceSearchResult) => void;
    /** Нажатие привязанной комбинации внутри книги (плагин распознал). */
    onHotkey?: (actionId: string) => void;
    /** Встроенные закладки файла, прочитанные после открытия книги. */
    onBookmarks?: (bookmarks: FileBookmark[]) => void;
    /** Миниатюры страниц, нарисованные плагином по запросу. */
    onThumbs?: (thumbnails: WorkplaceThumbnail[]) => void;
    /** Порция найденных в файле пометок. */
    onFileAnnotations?: (batch: FileAnnotationBatch) => void;
    /** Сноска книги, показанная плагином у её маркера (`null` — закрыть). */
    onFootnote?: (footnote: WorkplaceFootnote | null) => void;
    /** Содержание книги: главы, которые разобрал плагин. */
    onContents?: (chapters: FileChapter[]) => void;
    /** Текучая ли книга: плагин получает главы, а страничный — байты файла. */
    flowing?: boolean;
  }

  let {
    pluginId,
    path,
    title,
    zoom,
    initialPosition = 0,
    notes = [],
    tool = DEFAULT_NOTE_TOOL,
    readerTheme = DEFAULT_READER_THEME,
    readerFont = DEFAULT_READER_FONT,
    palette = DEFAULT_PALETTE,
    visible = true,
    onCapabilities,
    onState,
    onProgress,
    onLoadProgress,
    onSelection,
    onSelectionCleared,
    onTextPoint,
    onShape,
    onNoteClick,
    onNoteMenu,
    onNoteMenuClose,
    onPlaceNote,
    onError,
    onSearch,
    onHotkey,
    onBookmarks,
    onThumbs,
    onFileAnnotations,
    onFootnote,
    onContents,
    flowing = false,
  }: Props = $props();

  /** Канал сообщений между областью содержимого и приложением. */
  const CHANNEL = WORKPLACE_CHANNEL;

  /** Точка входа с внедрёнными файлами модуля. */
  let html = $state('');
  /** Готов ли плагин принимать содержимое книги. */
  let ready = $state(false);
  /** Отправлено ли содержимое книги плагину.
   *
   * Прочитанное содержимое готовится один раз за жизнь вкладки: повторный показ
   * не разбирает файл заново.
   */
  let bookSent = $state(false);
  /** Разобранное содержимое книги, ожидающее готовности модуля рисования.
   *
   * Книгу разбирает плагин формата (WASM) — это его предметная работа, а не
   * загрузка модуля рисования. Поэтому содержимое читается сразу при монтировании
   * вкладки, а модулю отдаётся, когда он сообщит о готовности.
   */
  let pendingBook: string | null = $state(null);
  /** Ошибка загрузки модуля или содержимого. */
  let error = $state<string | null>(null);
  /** Последний запрос поиска: при готовности модуля он отправляется заново. */
  let pendingSearch = '';
  /** Область содержимого книги. */
  let frame: HTMLIFrameElement | undefined = $state();
  /** Фон области чтения: убирает белую вспышку до отрисовки содержимого. */
  const readerBackground = $derived(readerThemeTokens(palette, readerTheme).background);

  /** Отправка сообщения модулю рисования. */
  function post(message: object) {
    frame?.contentWindow?.postMessage({ channel: CHANNEL, ...message }, '*');
  }

  /** Передача книги модулю, когда он готов и книга разобрана. */
  function sendBookWhenReady() {
    if (!ready || pendingBook === null) {
      return;
    }
    if (!bookSent) {
      bookSent = true;
      post({
        type: 'open',
        data: pendingBook,
        title,
        position: untrack(() => initialPosition),
        zoom,
      });
      sendNotes();
      return;
    }
    post({ type: 'show' });
  }

  /** Разбор содержимого книги: выполняется один раз при монтировании вкладки.
   *
   * Главы разбирает плагин формата (WASM) — это его предметная работа. Модулю
   * рисования приходят готовые главы JSON-ом в base64: байты книги в песочницу
   * не передаются, формат разобран до неё.
   */
  async function loadBook() {
    try {
      // Текучая книга приходит разобранными главами, страничная — байтами
      // файла: рисунок страниц делает модуль плагина, а не оболочка.
      const data = flowing
        ? encodeText(
            JSON.stringify(
              await readBookContent(path, (value) => onLoadProgress?.(value)),
            ),
          )
        : await readWorkplaceBook(path, undefined, (value) => onLoadProgress?.(value));
      onLoadProgress?.(null);
      pendingBook = data;
      sendBookWhenReady();
    } catch (e) {
      onLoadProgress?.(null);
      error = String(e);
      onError?.(error);
    }
  }
  /** Передача плагину непрозрачных якорей заметок книги. */
  function sendNotes() {
    if (!ready) {
      return;
    }
    post({
      type: 'notes',
      value: notes.map((note) => ({
        id: note.id,
        type: note.type,
        anchor: note.anchor,
        quote: note.quote,
        color: note.color,
        page: note.page,
        text: note.text,
        shape: note.shape,
        geometry: note.geometry,
      })),
    });
  }

  /** Передача плагину активного инструмента создания заметок. */
  function sendTool() {
    if (!ready) {
      return;
    }
    post({ type: 'tool', value: { type: tool.type, shape: tool.shape, color: tool.color } });
  }

  /** Передача плагину выбранного языка интерфейса.
   *
   * Плагин самостоятелен и своего выбора языка не имеет: он получает код
   * языка сообщением и берёт из своего словаря только те тексты, которые
   * показывает сам (состояние загрузки и ошибку).
   */
  function sendLocale() {
    if (!ready) {
      return;
    }
    post({ type: 'reader-locale', value: currentLocale() });
  }

  /** Передача плагину темы области чтения (сторона и готовые токены). */
  function sendReaderTheme() {
    if (!ready) {
      return;
    }
    // Гарнитура книги — часть темы области чтения: плагин получает готовое
    // семейство шрифта и не знает о гарнитурах приложения.
    const theme = buildReaderThemeMessage(palette, readerTheme);
    // Плоские тона подсветки цитат: куски подсветки перекрываются на доли
    // пикселя, и полупрозрачные слои складывали бы альфу в тёмную полосу.
    const solid = solidNoteTones(theme.value.notes, theme.value.tokens.background);
    post({
      ...theme,
      value: {
        ...theme.value,
        solid,
        font: readerFontFamily(readerFont),
        fontId: readerFont,
      },
    });
  }

  /** Передача плагину привязок клавиш приложения.
   *
   * Плагин живёт в песочнице и не видит реестр приложения, поэтому получает
   * готовый список сочетаний и только сообщает, какое действие нажато. Правил
   * сравнения комбинаций у плагина нет — они одни, в приложении.
   */
  function sendBindings() {
    if (!ready) {
      return;
    }
    post(viewerBindingsMessage(hotkeys.viewerBindings()));
  }

  /** Обработка сообщений модуля рисования. */
  function handleMessage(event: MessageEvent) {
    if (!isWorkplaceMessage(event, frame?.contentWindow)) {
      return;
    }
    const message = parseViewerMessage(event.data, tool);
    if (!message) {
      return;
    }
    switch (message.type) {
      case 'ready':
        ready = true;
        sendReaderTheme();
        sendLocale();
        sendTool();
        sendBindings();
        sendBookWhenReady();
        // Поиск, запрошенный до готовности модуля, отправляется теперь: иначе
        // запрос, набранный во время загрузки книги, терялся.
        if (pendingSearch) {
          post({ type: 'search', value: { query: pendingSearch } });
        }
        break;
      case 'capabilities':
        onCapabilities?.(message.value);
        break;
      case 'state':
        onState?.(message.value);
        break;
      case 'progress':
        onProgress?.(message.value);
        break;
      case 'selection':
        onSelection?.(message.anchor, { x: message.x, y: message.y });
        break;
      case 'selection-cleared':
        onSelectionCleared?.();
        break;
      case 'text-point':
        onTextPoint?.(message.anchor, message.color);
        break;
      case 'shape':
        onShape?.(message.anchor, message.shape, message.geometry, message.color);
        break;
      case 'note-click':
        onNoteClick?.(message.noteId);
        break;
      case 'note-menu':
        onNoteMenu?.(message.value);
        break;
      case 'note-menu-close':
        onNoteMenuClose?.();
        break;
      case 'place-note':
        onPlaceNote?.(message.noteId, message.anchor, message.geometry);
        break;
      case 'footnote':
        onFootnote?.(message.value);
        break;
      case 'footnote-close':
        onFootnote?.(null);
        break;
      case 'contents':
        onContents?.(message.value);
        break;
      case 'error':
        error = message.message;
        onError?.(error);
        break;
      case 'open-external':
        void openBookFile(path);
        break;
      case 'open-link':
        // Внешняя ссылка книги из песочницы: открывает приложение системным
        // браузером, сама область этого сделать не может.
        void openBookLink(message.href).catch(() => undefined);
        break;
      case 'search':
        onSearch?.(message.value);
        break;
      case 'hotkey':
        onHotkey?.(message.actionId);
        break;
      case 'bookmarks':
        onBookmarks?.(message.value);
        break;
      case 'thumbs':
        onThumbs?.(message.value);
        break;
      case 'file-annotations':
        onFileAnnotations?.(message.value);
        break;
    }
  }

  onMount(() => {
    void loadBook();
    void loadWorkplaceBundle(pluginId)
      .then(({ entry, files }) => {
        html = buildViewerDocument(entry, files);
      })
      .catch((e) => {
        error = String(e);
        onError?.(error);
      });
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });

  /** Применение масштаба модулю рисования. */
  $effect(() => {
    const value = zoom;
    if (ready) {
      post({ type: 'zoom', value });
    }
  });

  /** Передача заметок при их изменении. */
  $effect(() => {
    void notes;
    sendNotes();
  });

  /** Передача активного инструмента при его смене. */
  $effect(() => {
    void tool.type;
    void tool.shape;
    void tool.color;
    sendTool();
  });

  /** Действующая гарнитура: часть темы, поэтому читается вместе с ней. */
  const activeFont = $derived(readerFontFamily(readerFont));

  /** Передача темы области чтения при её смене (сторона, палитра, гарнитура). */
  $effect(() => {
    void readerTheme;
    void palette;
    void activeFont;
    sendReaderTheme();
  });

  /** Передача языка при его смене в настройках. */
  $effect(() => {
    void currentLocale();
    sendLocale();
  });

  /** Доведение отрисовки по возврату видимости области чтения.
   *
   * Смена темы или палитры может произойти, пока рабочее место скрыто другим
   * разделом: плагин получает `reader-theme`, но при нулевом размере области
   * рисовать нечем, и страница остаётся в прежней раскраске. По возврате
   * видимости шлём `show`, чтобы плагин перерисовал «грязные» страницы, не
   * полагаясь на срабатывание наблюдателя размера в webview. */
  $effect(() => {
    if (visible && ready) {
      // Готовность модуля и разобранная книга отправляются вместе: книга
      // разбирается сразу, а показывается, когда модуль готов.
      sendBookWhenReady();
    }
  });

  /** Закрытие меню сноски по действию оболочки.
   *
   * Плагин держит маркер открытой сноски: без уведомления повторный клик по
   * нему считался бы закрытием и меню не открылось бы снова.
   */
  export function closeFootnote() {
    if (!ready) {
      return;
    }
    post({ type: 'footnote-close' });
  }

  /** Снятие выделения в книге по действию оболочки (закрытие меню, отмена).
   *
   * Выделение живёт в документе плагина, поэтому снять его может только он:
   * оболочка сообщает команду, а плагин убирает диапазон и слой выделения.
   */
  export function clearSelection() {
    if (!ready) {
      return;
    }
    post({ type: 'clear-selection' });
  }

  /** Переход к странице. */
  export function gotoPage(page: number) {
    post({ type: 'goto', value: { page } });
  }

  /** Переход к главе книги из панели содержания.
   *
   * Глава адресуется номером в содержимом, которое разобрал плагин формата;
   * где именно она лежит в документе, знает только плагин.
   */
  export function gotoChapter(index: number) {
    post({ type: 'goto', value: { chapter: index } });
  }

  /** Переход к якорю заметки. */
  export function gotoAnchor(anchor: string, noteId = '') {
    post({ type: 'goto', value: { anchor, noteId } });
  }

  /** Команда меню заметки плагину: перемещение или правка границ. */
  export function noteMenuAction(noteId: string, action: 'move' | 'resize') {
    post({ type: 'note-menu-action', value: { noteId, action } });
  }

  /** Запрос поиска по содержимому книги у модуля рисования. */
  export function search(query: string) {
    pendingSearch = query;
    if (!ready) {
      return;
    }
    post({ type: 'search', value: { query } });
  }

  /** Переход к соседнему вхождению поиска по кругу. */
  export function stepSearch(delta: 1 | -1) {
    if (!ready) {
      return;
    }
    post({ type: 'search-step', value: { delta } });
  }

  /** Запрос миниатюр страниц у модуля рисования. */
  export function requestThumbs(pages: number[], width: number) {
    if (!ready) {
      return;
    }
    post({ type: 'thumbs', value: { pages, width } });
  }

  /** Запуск анализа встроенных в файл пометок. */
  export function analyzeAnnotations() {
    if (!ready) {
      return;
    }
    post({ type: 'annotate' });
  }

  /** Остановка анализа встроенных пометок. */
  export function stopAnnotations() {
    if (!ready) {
      return;
    }
    post({ type: 'annotate-stop' });
  }

  /** Сброс кэша превью в модуле: картинки будут нарисованы заново. */
  export function resetThumbs() {
    if (!ready) {
      return;
    }
    post({ type: 'thumbs-reset' });
  }

  /** Показ выбранных встроенных пометок на страницах. */
  export function showAnnotations(ids: string[]) {
    if (!ready) {
      return;
    }
    post({ type: 'show-annotations', value: { ids } });
  }

  /** Команда действия над содержимым книги.
   *
   * Прокрутка и переход к краю книги — работа того, кто владеет содержимым: у
   * страничного формата это модуль рисования. Клавиша и кнопка присылают сюда
   * одно и то же, поэтому навигация не расходится между форматами.
   */
  export function sendCommand(id: string) {
    if (!ready) {
      return;
    }
    post(viewerCommand(id));
  }</script>

<div class="h-full w-full" data-testid="workplace-content">
  {#if error}
    <div class="mx-auto max-w-[35rem] p-6 text-center">
      <p class="text-[var(--destructive)]" data-testid="workplace-error">{error}</p>
    </div>
  {:else}
    <iframe
      bind:this={frame}
      class="h-full w-full border-0"
      style="background: {readerBackground}"
      title={t('app.reader.content')}
      sandbox="allow-scripts"
      srcdoc={html}
    ></iframe>
  {/if}
</div>
