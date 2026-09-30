<script lang="ts">
  import { onMount } from 'svelte';
  import {
    loadWorkplaceViewer,
    openBookExternally,
    readWorkplaceBook,
  } from './reader';

  interface Props {
    /** Идентификатор плагина рабочего места. */
    pluginId: string;
    /** Путь к файлу открытой книги (вложение вкладки). */
    path: string;
    /** Название открытой книги. */
    title: string;
    /** Текущий масштаб отображения в процентах. */
    zoom: number;
    /** Возможности плагина, сообщённые после загрузки. */
    onCapabilities?: (capabilities: { zoom?: boolean }) => void;
    /** Прогресс чтения в процентах. */
    onProgress?: (value: number) => void;
    /** Ошибка отображения содержимого. */
    onError?: (message: string) => void;
  }

  let { pluginId, path, title, zoom, onCapabilities, onProgress, onError }: Props = $props();

  /** Канал сообщений между областью содержимого и приложением. */
  const CHANNEL = 'texture-workplace';

  /** HTML-модуль рисования плагина. */
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
      const data = await readWorkplaceBook(path);
      post({ type: 'open', data, title });
    } catch (e) {
      error = String(e);
      onError?.(error);
    }
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
      onCapabilities?.((message.value as { zoom?: boolean }) ?? {});
    } else if (message.type === 'progress' && typeof message.value === 'number') {
      onProgress?.(Math.max(0, Math.min(100, message.value)));
    } else if (message.type === 'error') {
      error = String(message.message ?? 'не удалось отобразить книгу');
      onError?.(error);
    } else if (message.type === 'open-external') {
      void openBookExternally(path);
    }
  }

  onMount(() => {
    void loadWorkplaceViewer(pluginId)
      .then((value) => {
        html = value;
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

  $effect(() => {
    const value = zoom;
    if (ready) {
      post({ type: 'zoom', value });
    }
  });
</script>

<div class="h-full w-full" data-testid="workplace-content">
  {#if error}
    <div class="mx-auto max-w-[560px] p-[var(--space-5)] text-center">
      <p class="text-[var(--color-danger)]" data-testid="workplace-error">{error}</p>
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
