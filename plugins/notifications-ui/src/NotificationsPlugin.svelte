<script lang="ts">
  import { onMount } from 'svelte';
  import type { Entry } from './types';
  import { listen, onViewport, operation, setLayout, viewport } from './bridge';
  import NotificationsPanel from './NotificationsPanel.svelte';
  import NotificationsPage from './NotificationsPage.svelte';

  const MOBILE_WIDTH = 900;

  let entries: Entry[] = $state([]);
  let technicalVisible = $state(false);
  let isMobile = $state(false);
  let collapsed = $state(true);
  let pageOpen = $state(false);
  let errorMessage = $state('');

  /** Количество непрочитанных пользовательских уведомлений. */
  let unreadUser = $derived(entries.filter((entry) => entry.level === 'User' && !entry.read).length);

  /** Сообщение оболочке о текущем состоянии региона уведомлений. */
  function syncLayout() {
    if (isMobile) {
      setLayout(pageOpen ? 'page' : 'collapsed');
    } else {
      setLayout(collapsed ? 'collapsed' : 'expanded');
    }
  }

  /** Применение размеров окна приложения. */
  function applyViewport(width: number) {
    isMobile = width < MOBILE_WIDTH;
    syncLayout();
  }

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

  /** Обработка разворачивания панели: отметка прочтения и пересчёт региона. */
  function handleToggle() {
    if (!collapsed) {
      void markAllRead();
    }
    syncLayout();
  }

  /** Открытие мобильной страницы уведомлений. */
  function openPage() {
    pageOpen = true;
    syncLayout();
    void markAllRead();
  }

  /** Возврат с мобильной страницы уведомлений. */
  function closePage() {
    pageOpen = false;
    syncLayout();
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    const offViewport = onViewport((value) => applyViewport(value.width));
    void (async () => {
      const current = await viewport();
      applyViewport(current.width);
      unlisten = await listen<Entry>('notifications:added', (entry) => {
        entries = [...entries, entry];
      });
      await loadSettings();
      await load();
    })();
    return () => {
      unlisten?.();
      offViewport();
    };
  });
</script>

{#if isMobile}
  {#if pageOpen}
    <NotificationsPage
      {entries}
      bind:technicalVisible
      {markAllRead}
      clear={clearEntries}
      onBack={closePage}
    />
  {:else}
    <div class="collapsed" onclick={openPage} onkeydown={openPage} role="button" tabindex="0" title="Уведомления">
      <span class="collapsed-label">Уведомления</span>
      <span class="count-badge">{unreadUser}</span>
    </div>
  {/if}
{:else}
  <NotificationsPanel
    {entries}
    bind:technicalVisible
    bind:collapsed
    {markAllRead}
    clear={clearEntries}
    onToggle={handleToggle}
  />
{/if}

{#if errorMessage}
  <div class="plugin-error" role="alert">{errorMessage}</div>
{/if}

<style>
  .collapsed {
    box-sizing: border-box;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding-top: 16px;
    cursor: pointer;
    background: #f0f0f0;
  }

  .collapsed:hover {
    background: #e4e4e4;
  }

  .collapsed-label {
    writing-mode: vertical-rl;
    font-size: 12px;
    color: #555;
    letter-spacing: 1px;
  }

  .count-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 12px;
    background: #4caf50;
    color: #fff;
    font-size: 13px;
    font-weight: bold;
  }

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
