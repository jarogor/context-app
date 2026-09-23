<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import { listen } from '@tauri-apps/api/event';

  /** Сообщение frontend-плагина без идентификатора запроса. */
  interface PluginMessage {
    type?: string;
    value?: unknown;
    event?: string;
  }

  interface Props {
    src: string;
    title: string;
    onMessage?: (message: PluginMessage) => void;
  }

  let { src, title, onMessage }: Props = $props();

  let frame: HTMLIFrameElement;
  const subscriptions = new Map<string, () => void>();

  /** Текущие размеры окна приложения. */
  function currentViewport() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  /** Отправка размеров окна в frontend-плагин. */
  function postViewport() {
    frame?.contentWindow?.postMessage(
      { channel: 'booklib-plugin', type: 'viewport', value: currentViewport() },
      '*',
    );
  }

  async function handleMessage(event: MessageEvent) {
    if (event.source !== frame?.contentWindow) return;
    const message = event.data;
    if (!message || message.channel !== 'booklib-plugin') return;
    if (!message.id) {
      onMessage?.(message);
      return;
    }
    try {
      let value: unknown;
      if (message.type === 'invoke') {
        value = await invoke(message.command, message.payload);
      } else if (message.type === 'dialog.open') {
        value = await open(message.payload);
      } else if (message.type === 'viewport') {
        value = currentViewport();
      } else if (message.type === 'listen') {
        if (!subscriptions.has(message.event)) {
          subscriptions.set(
            message.event,
            await listen(message.event, (event) => {
              frame.contentWindow?.postMessage(
                { channel: 'booklib-plugin', type: 'event', event: message.event, value: event.payload },
                '*',
              );
            }),
          );
        }
        value = true;
      }
      frame.contentWindow?.postMessage(
        { channel: 'booklib-plugin', type: 'response', id: message.id, value },
        '*',
      );
    } catch (error) {
      frame.contentWindow?.postMessage(
        { channel: 'booklib-plugin', type: 'response', id: message.id, error: String(error) },
        '*',
      );
    }
  }

  $effect(() => {
    window.addEventListener('message', handleMessage);
    window.addEventListener('resize', postViewport);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('resize', postViewport);
    };
  });
</script>

<iframe bind:this={frame} class="plugin-frame" {src} {title} onload={postViewport}></iframe>

<style>
  .plugin-frame {
    width: 100%;
    height: 100%;
    min-height: 0;
    border: 0;
    display: block;
  }
</style>
