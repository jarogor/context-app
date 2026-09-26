<script lang="ts">
  import { invokeCommand, listenEvent, openDialog } from './app-bridge';

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
      { channel: 'texture-plugin', type: 'viewport', value: currentViewport() },
      '*',
    );
  }

  async function handleMessage(event: MessageEvent) {
    if (event.source !== frame?.contentWindow) return;
    const message = event.data;
    if (!message || message.channel !== 'texture-plugin') return;
    if (!message.id) {
      onMessage?.(message);
      return;
    }
    try {
      let value: unknown;
      if (message.type === 'invoke') {
        value = await invokeCommand(message.command, message.payload);
      } else if (message.type === 'dialog.open') {
        value = await openDialog(message.payload);
      } else if (message.type === 'viewport') {
        value = currentViewport();
      } else if (message.type === 'listen') {
        if (!subscriptions.has(message.event)) {
          subscriptions.set(
            message.event,
            await listenEvent(message.event, (payload) => {
              frame.contentWindow?.postMessage(
                { channel: 'texture-plugin', type: 'event', event: message.event, value: payload },
                '*',
              );
            }),
          );
        }
        value = true;
      }
      frame.contentWindow?.postMessage(
        { channel: 'texture-plugin', type: 'response', id: message.id, value },
        '*',
      );
    } catch (error) {
      frame.contentWindow?.postMessage(
        { channel: 'texture-plugin', type: 'response', id: message.id, error: String(error) },
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

<iframe
  bind:this={frame}
  class="block h-full min-h-0 w-full border-0"
  {src}
  {title}
  onload={postViewport}
></iframe>
