<script lang="ts">
  import { onMount } from 'svelte';
  import type { Entry } from './types';
  import { listen, operation } from './bridge';
  import NotificationsPanel from './NotificationsPanel.svelte';

  let entries: Entry[] = $state([]);
  let technicalVisible = $state(false);
  let errorMessage = $state('');

  /** Количество непрочитанных пользовательских уведомлений. */
  let unreadUser = $derived(entries.filter((entry) => entry.level === 'User' && !entry.read).length);

  /** Передача счётчика в оболочку для кнопки в верхней панели. */
  $effect(() => {
    window.parent.postMessage(
      { channel: 'booklib-plugin', type: 'notifications-count', value: unreadUser },
      '*',
    );
  });

  /** Загрузка настройки технического уровня из секции плагина уведомлений. */
  async function loadSettings() {
    try {
      const data = await operation<{ values?: { technical_visible_default?: unknown } }>('get', {
        section: 'notifications.notifications',
      });
      if (typeof data.values?.technical_visible_default === 'boolean') {
        technicalVisible = data.values.technical_visible_default;
      }
    } catch {
      // Отсутствие секции настроек не мешает панели уведомлений.
    }
  }

  /** Загрузка журнала уведомлений. */
  async function load() {
    try {
      const data = await operation<{ entries: Entry[] }>('list', { level: null });
      entries = data.entries;
      errorMessage = '';
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Пометка всех записей прочитанными. */
  async function markAllRead() {
    try {
      await operation('mark_all_read', {});
      entries = entries.map((entry) => ({ ...entry, read: true }));
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Полная очистка журнала. */
  async function clearEntries() {
    try {
      await operation('clear', {});
      await load();
    } catch (error) {
      errorMessage = String(error);
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen<Entry>('notifications:added', (entry) => {
        entries = [...entries, entry];
      });
      await loadSettings();
      await load();
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<NotificationsPanel {entries} bind:technicalVisible {markAllRead} clear={clearEntries} />

{#if errorMessage}
  <div class="plugin-error" role="alert">{errorMessage}</div>
{/if}

<style>
  .plugin-error {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: 8px;
    padding: 8px;
    border-radius: 4px;
    background: #fdecea;
    color: #b3261e;
    font-size: 12px;
    z-index: 10;
  }
</style>
