<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    loadWorkplaceBundle,
    openBookFile,
    readWorkplaceBook,
  } from './reader';
  import { buildViewerDocument } from './viewer-bundle';
  import type { Note, NoteColor, NoteTool, ShapeKind } from '../notes/notes';
  import { DEFAULT_NOTE_TOOL } from '../notes/notes';
  import type { QuoteAnchor } from './reader/anchor';
  import {
    WORKPLACE_CHANNEL,
    buildReaderThemeMessage,
    isWorkplaceMessage,
    parseViewerMessage,
    type WorkplaceCapabilities,
    type WorkplaceNoteMenu,
    type WorkplaceState,
  } from './workplace-protocol';
  import { DEFAULT_PALETTE, DEFAULT_READER_THEME, readerThemeTokens, type PaletteId, type ReaderThemeId } from '@texture/ui';

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
  }: Props = $props();

  /** Канал сообщений между областью содержимого и приложением. */
  const CHANNEL = WORKPLACE_CHANNEL;

  /** Точка входа с внедрёнными файлами модуля. */
  let html = $state('');
  /** Готов ли плагин принимать содержимое книги. */
  let ready = $state(false);
  /** Ошибка загрузки модуля или содержимого. */
  let error = $state<string | null>(null);
  /** Область содержимого книги. */
  let frame: HTMLIFrameElement | undefined = $state();
  /** Фон области чтения: убирает белую вспышку до отрисовки содержимого. */
  const readerBackground = $derived(readerThemeTokens(palette, readerTheme).background);

  /** Отправка сообщения модулю рисования. */
  function post(message: Record<string, unknown>) {
    frame?.contentWindow?.postMessage({ channel: CHANNEL, ...message }, '*');
  }

  /** Передача содержимого книги модулю рисования. */
  async function sendBook() {
    try {
      const data = await readWorkplaceBook(path, undefined, (value) =>
        onLoadProgress?.(value),
      );
      onLoadProgress?.(null);
      post({
        type: 'open',
        data,
        title,
        position: untrack(() => initialPosition),
        zoom,
      });
      sendNotes();
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

  /** Передача плагину темы области чтения (сторона и готовые токены). */
  function sendReaderTheme() {
    if (!ready) {
      return;
    }
    post(buildReaderThemeMessage(palette, readerTheme));
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
        void sendBook();
        sendTool();
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
      case 'error':
        error = message.message;
        onError?.(error);
        break;
      case 'open-external':
        void openBookFile(path);
        break;
    }
  }

  onMount(() => {
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

  /** Передача темы области чтения при её смене (сторона или палитра). */
  $effect(() => {
    void readerTheme;
    void palette;
    sendReaderTheme();
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
      post({ type: 'show' });
    }
  });

  /** Переход к странице. */
  export function gotoPage(page: number) {
    post({ type: 'goto', value: { page } });
  }

  /** Переход к якорю заметки. */
  export function gotoAnchor(anchor: string, noteId = '') {
    post({ type: 'goto', value: { anchor, noteId } });
  }

  /** Команда меню заметки плагину: перемещение или правка границ. */
  export function noteMenuAction(noteId: string, action: 'move' | 'resize') {
    post({ type: 'note-menu-action', value: { noteId, action } });
  }
</script>

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
      title="Содержимое книги"
      sandbox="allow-scripts"
      srcdoc={html}
    ></iframe>
  {/if}
</div>
