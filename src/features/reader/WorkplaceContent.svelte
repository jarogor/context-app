<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    loadWorkplaceBundle,
    openBookExternally,
    readWorkplaceBook,
  } from './reader';
  import { buildViewerDocument } from './viewer-bundle';
  import type { Note } from '../notes/notes';
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
    /** Заметки-цитаты книги (непрозрачные якоря плагину). */
    notes?: Note[];
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
    /** Клик по подсветке заметки: открыть панель и выбрать заметку. */
    onNoteClick?: (noteId: string) => void;
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
    onCapabilities,
    onState,
    onProgress,
    onLoadProgress,
    onSelection,
    onSelectionCleared,
    onNoteClick,
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
        anchor: note.anchor,
        quote: note.quote,
        page: note.page,
      })),
    });
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
    } else if (message.type === 'note-click') {
      const value = (message.value as { noteId?: unknown }) ?? {};
      if (typeof value.noteId === 'string') {
        onNoteClick?.(value.noteId);
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
