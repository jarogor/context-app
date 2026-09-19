<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import { listen } from '@tauri-apps/api/event';

  interface Props {
    src: string;
    title: string;
  }

  let { src, title }: Props = $props();

  let frame: HTMLIFrameElement;
  const subscriptions = new Map<string, () => void>();

  async function handleMessage(event: MessageEvent) {
    if (event.source !== frame?.contentWindow) return;
    const message = event.data;
    if (!message || message.channel !== 'booklib-plugin' || !message.id) return;
    try {
      let value: unknown;
      if (message.type === 'invoke') {
        value = await invoke(message.command, message.payload);
      } else if (message.type === 'dialog.open') {
        value = await open(message.payload);
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
    return () => window.removeEventListener('message', handleMessage);
  });
</script>

<iframe bind:this={frame} class="plugin-frame" {src} {title}></iframe>

<style>
  .plugin-frame {
    width: 100%;
    height: 100vh;
    min-height: 100vh;
    border: 0;
    display: block;
  }
</style>
