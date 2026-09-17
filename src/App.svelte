<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import Library from './pages/Library.svelte';
  import Reading from './pages/Reading.svelte';
  import Notifications from './pages/Notifications.svelte';
  import NotificationsPanel from './lib/NotificationsPanel.svelte';
  import type { Book, Entry } from './types';

  const TECHNICAL_VISIBLE_KEY = 'notifications.technicalVisible';
  const MOBILE_QUERY = '(max-width: 899px)';

  let currentPage: string = $state('library');
  let returnPage: string = $state('library');
  let currentBookId: number = $state(0);
  let cachedBooks: Book[] = $state([]);
  let notifications: Entry[] = $state([]);
  let technicalVisible: boolean = $state(readTechnicalVisible());
  let isMobile: boolean = $state(initialIsMobile());
  let panelCollapsed: boolean = $state(true);

  /** Количество непрочитанных пользовательских уведомлений. */
  let unreadUser = $derived(
    notifications.filter((entry) => entry.level === 'User' && !entry.read).length,
  );

  /** Чтение сохранённого флага технического уровня. */
  function readTechnicalVisible(): boolean {
    try {
      return localStorage.getItem(TECHNICAL_VISIBLE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /** Начальное значение признака мобильной раскладки. */
  function initialIsMobile(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  $effect(() => {
    try {
      localStorage.setItem(TECHNICAL_VISIBLE_KEY, String(technicalVisible));
    } catch {
      // localStorage может быть недоступен — флаг просто не сохранится.
    }
  });

  /** Переход между страницами приложения. */
  function navigate(page: string, bookId?: number) {
    if (page === 'notifications') {
      returnPage = currentPage;
    }
    currentPage = page;
    if (bookId !== undefined) {
      currentBookId = bookId;
    }
  }

  /** Возврат на страницу, с которой была открыта страница уведомлений. */
  function goBack() {
    navigate(returnPage === 'notifications' ? 'library' : returnPage);
  }

  /** Загрузка всех записей журнала. */
  async function loadNotifications() {
    try {
      notifications = await invoke<Entry[]>('list_journal', { level: null });
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  /** Пометка всех записей прочитанными. */
  async function markAllRead() {
    try {
      await invoke('mark_all_read');
      await loadNotifications();
    } catch (error) {
      console.error('Failed to mark all read:', error);
    }
  }

  /** Полная очистка журнала. */
  async function clearNotifications() {
    try {
      await invoke('clear_journal');
      await loadNotifications();
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = () => {
      isMobile = query.matches;
    };
    query.addEventListener('change', onChange);
    void (async () => {
      unlisten = await listen('journal:added', () => {
        void loadNotifications();
      });
      await loadNotifications();
    })();
    return () => {
      unlisten?.();
      query.removeEventListener('change', onChange);
    };
  });
</script>

{#if !isMobile}
  <NotificationsPanel
    entries={notifications}
    bind:technicalVisible
    bind:collapsed={panelCollapsed}
    markAllRead={markAllRead}
    clear={clearNotifications}
  />
{/if}

<main class="app-content {!isMobile ? (panelCollapsed ? 'panel-collapsed' : 'panel-expanded') : ''}">
  {#if currentPage === 'library'}
    <Library
      onNavigate={navigate}
      books={cachedBooks}
      onBooksChange={(books: Book[]) => (cachedBooks = books)}
      unreadNotifications={unreadUser}
    />
  {:else if currentPage === 'reading'}
    <Reading bookId={currentBookId} onNavigate={navigate} />
  {:else if currentPage === 'notifications' && isMobile}
    <div class="notifications-page">
      <Notifications
        entries={notifications}
        bind:technicalVisible
        markAllRead={markAllRead}
        clear={clearNotifications}
        onBack={goBack}
      />
    </div>
  {:else if currentPage === 'notifications'}
    <Library
      onNavigate={navigate}
      books={cachedBooks}
      onBooksChange={(books: Book[]) => (cachedBooks = books)}
      unreadNotifications={unreadUser}
    />
  {/if}
</main>

<style>
  .app-content {
    min-height: 100vh;
    transition: margin-left 0.2s ease;
  }

  /* Десктопная панель докнута слева: контент сдвигается на её ширину. */
  .panel-collapsed {
    margin-left: 40px;
  }

  .panel-expanded {
    margin-left: 400px;
  }

  .notifications-page {
    height: 100vh;
    overflow: hidden;
  }
</style>