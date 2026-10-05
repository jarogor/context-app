<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    loadWorkplaceBundle,
    openBookExternally,
    readWorkplaceBook,
  } from './reader';
  import { buildViewerDocument } from './viewer-bundle';
  import type { Note, NoteColor, NoteTool, ShapeKind } from '../notes/notes';
  import { DEFAULT_NOTE_TOOL } from '../notes/notes';
  import type { QuoteAnchor } from './reader/anchor';

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
    /** Возможности плагина, сообщённые после загрузки. */
    onCapabilities?: (capabilities: { zoom?: boolean; pages?: boolean; selection?: boolean }) => void;
    /** Состояние позиции: страница и их общее число. */
    onState?: (state: { page: number | null; pages: number | null }) => void;
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
    onCapabilities,
    onState,
    onProgress,
    onLoadProgress,
    onSelection,
    onSelectionCleared,
    onTextPoint,
    onShape,
    onNoteClick,
    onPlaceNote,
    onError,
  }: Props = $props();

  /** Канал сообщений между областью содержимого и приложением. */
  const CHANNEL = 'texture-workplace';

  /** Точка входа с внедрёнными файлами модуля. */
  let html = $state('');
  /** Готов ли плагин принимать содержимое книги. */
  let ready = $state(false);
  /** Ошибка загрузки модуля или содержимого. */
  let error = $state<string | null>(null);
  /** Область содержимого книги. */
  let frame: HTMLIFrameElement | undefined = $state();

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

  /** Обработка сообщений модуля рисования. */
  function handleMessage(event: MessageEvent) {
    if (event.source !== frame?.contentWindow) {
      return;
    }
    const message = event.data as
      | { channel?: string; type?: string; value?: unknown; message?: unknown }
      | null
      | undefined;
    if (!message || message.channel !== CHANNEL) {
      return;
    }
    if (message.type === 'ready') {
      ready = true;
      void sendBook();
      sendTool();
    } else if (message.type === 'capabilities') {
      onCapabilities?.(
        (message.value as { zoom?: boolean; pages?: boolean; selection?: boolean }) ?? {},
      );
    } else if (message.type === 'state') {
      const value = (message.value as { page?: unknown; pages?: unknown }) ?? {};
      const page = Number.isFinite(Number(value.page)) ? Number(value.page) : null;
      const pages = Number.isFinite(Number(value.pages)) ? Number(value.pages) : null;
      onState?.({ page, pages });
    } else if (message.type === 'progress' && typeof message.value === 'number') {
      onProgress?.(Math.max(0, Math.min(100, message.value)));
    } else if (message.type === 'selection') {
      const value = (message.value as { anchor?: QuoteAnchor; x?: number; y?: number }) ?? {};
      if (value.anchor) {
        onSelection?.(value.anchor, { x: Number(value.x) || 0, y: Number(value.y) || 0 });
      }
    } else if (message.type === 'selection-cleared') {
      onSelectionCleared?.();
    } else if (message.type === 'text-point') {
      const value = (message.value as { anchor?: QuoteAnchor; color?: unknown }) ?? {};
      if (value.anchor) {
        const color = String(value.color ?? tool.color);
        onTextPoint?.(value.anchor, color as NoteColor);
      }
    } else if (message.type === 'shape') {
      const value =
        (message.value as {
          anchor?: QuoteAnchor;
          shape?: unknown;
          geometry?: unknown;
          color?: unknown;
        }) ?? {};
      if (value.anchor) {
        onShape?.(
          value.anchor,
          String(value.shape ?? tool.shape) as ShapeKind,
          String(value.geometry ?? ''),
          String(value.color ?? tool.color) as NoteColor,
        );
      }
    } else if (message.type === 'note-click') {
      const value = (message.value as { noteId?: unknown }) ?? {};
      if (typeof value.noteId === 'string') {
        onNoteClick?.(value.noteId);
      }
    } else if (message.type === 'place-note') {
      const value =
        (message.value as { noteId?: unknown; anchor?: QuoteAnchor; geometry?: unknown }) ?? {};
      if (typeof value.noteId === 'string' && value.anchor) {
        onPlaceNote?.(value.noteId, value.anchor, value.geometry === undefined ? undefined : String(value.geometry));
      }
    } else if (message.type === 'error') {
      error = String(message.message ?? 'не удалось отобразить книгу');
      onError?.(error);
    } else if (message.type === 'open-external') {
      void openBookExternally(path);
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

  /** Переход к странице. */
  export function gotoPage(page: number) {
    post({ type: 'goto', value: { page } });
  }

  /** Переход к якорю заметки. */
  export function gotoAnchor(anchor: string, noteId = '') {
    post({ type: 'goto', value: { anchor, noteId } });
  }
</script>

<div class="h-full w-full" data-testid="workplace-content">
  {#if error}
    <div class="mx-auto max-w-[560px] p-6 text-center">
      <p class="text-[var(--destructive)]" data-testid="workplace-error">{error}</p>
    </div>
  {:else}
    <iframe
      bind:this={frame}
      class="h-full w-full border-0 bg-white"
      title="Содержимое книги"
      sandbox="allow-scripts"
      srcdoc={html}
    ></iframe>
  {/if}
</div>
