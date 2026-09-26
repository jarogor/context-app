<script lang="ts">
  import { onMount } from 'svelte';
  import type { Entry } from './types';
  import { listen, operation, settingsOperation } from './bridge';
  import NotificationsPanel from './NotificationsPanel.svelte';

  let entries: Entry[] = $state([]);
  let technicalVisible = $state(false);
  let errorMessage = $state('');

  /** Количество непрочитанных пользовательских уведомлений. */
  let unreadUser = $derived(entries.filter((entry) => entry.level === 'User' && !entry.read).length);

  /** Передача счётчика в оболочку для кнопки в верхней панели. */
  $effect(() => {
    window.parent.postMessage(
      { channel: 'texture-plugin', type: 'notifications-count', value: unreadUser },
      '*',
    );
  });

  /** Локальный идентификатор секции настроек плагина уведомлений. */
  const SETTINGS_SECTION_LOCAL_ID = 'notifications';

  /** Загрузка настройки технического уровня из секции плагина уведомлений. */
  async function loadSettings() {
    try {
      const data = await settingsOperation<{
        sections?: { id: string; values?: { technical_visible_default?: unknown } }[];
      }>('list', {});
      const section = data.sections?.find(
        (item) => item.id.split('.').pop() === SETTINGS_SECTION_LOCAL_ID,
      );
      if (typeof section?.values?.technical_visible_default === 'boolean') {
        technicalVisible = section.values.technical_visible_default;
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
    let unlistenAdded: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;
    void (async () => {
      unlistenAdded = await listen<Entry>('notifications:added', (entry) => {
        entries = [...entries, entry];
      });
      unlistenSettings = await listen('settings:changed', () => {
        void loadSettings();
      });
      await loadSettings();
      await load();
    })();
    return () => {
      unlistenAdded?.();
      unlistenSettings?.();
    };
  });
</script>

<NotificationsPanel {entries} bind:technicalVisible {markAllRead} clear={clearEntries} />

{#if errorMessage}
  <div
    class="fixed right-[8px] bottom-[8px] left-[8px] z-10 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-[var(--space-2)] text-xs text-[var(--color-danger)]"
    role="alert"
  >
    {errorMessage}
  </div>
{/if}
