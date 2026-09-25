<script lang="ts">
  import PluginFrame from './lib/PluginFrame.svelte';

  /** Сообщение frontend-плагина без идентификатора запроса. */
  interface PluginMessage {
    type?: string;
    value?: unknown;
  }

  /** Страница раздела настроек. */
  type SettingsSection = 'general' | 'plugins';

  /** Открыт ли раздел настроек; состояние принадлежит оболочке. */
  let settingsOpen = $state(false);

  /** Выбранная страница раздела настроек. */
  let settingsSection = $state<SettingsSection>('general');

  /** Открыта ли панель уведомлений; состояние принадлежит оболочке. */
  let notificationsOpen = $state(false);

  /** Число непрочитанных уведомлений, полученное от frontend-плагина. */
  let unreadCount = $state(0);

  /** Название текущего раздела в верхней панели. */
  const sectionTitle = $derived(
    settingsOpen ? (settingsSection === 'plugins' ? 'Плагины' : 'Настройки') : 'Библиотека',
  );

  /** Переключение между основным разделом и настройками. */
  function toggleSettings() {
    settingsOpen = !settingsOpen;
  }

  /** Выбор страницы раздела настроек. */
  function selectSettingsSection(section: SettingsSection) {
    settingsSection = section;
  }

  /** Переключение панели уведомлений. */
  function toggleNotifications() {
    notificationsOpen = !notificationsOpen;
  }

  /** Обработка сообщений frontend-плагинов без ответа. */
  function handlePluginMessage(message: PluginMessage) {
    if (message.type === 'notifications-count' && typeof message.value === 'number') {
      unreadCount = message.value;
    }
  }
</script>

<div class="app-root">
  <header class="app-header">
    <span class="app-title">BookLib</span>
    <span class="app-section">{sectionTitle}</span>
    <div class="header-actions">
      <button
        class="icon-button"
        type="button"
        onclick={toggleNotifications}
        title="Уведомления"
        aria-label="Уведомления"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-5v-1l-1.7-1.7V10a5.3 5.3 0 0 0-4-5.2V4a1.3 1.3 0 0 0-2.6 0v.8A5.3 5.3 0 0 0 6.7 10v4.3L5 16v1Z"
            fill="currentColor"
          />
        </svg>
        <span class="count-badge" class:muted={unreadCount === 0}>{unreadCount}</span>
      </button>
      <button
        class="icon-button"
        type="button"
        onclick={toggleSettings}
        title="Настройки"
        aria-label="Настройки"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
  </header>

  <div class="app-body">
    <main class="app-content">
      <div class="content-pane" class:hidden={settingsOpen}>
        <PluginFrame src="/plugins/library-ui/index.html" title="Library plugin" />
      </div>
      <div class="settings-view" class:hidden={!settingsOpen}>
        <nav class="settings-menu" aria-label="Настройки">
          <button
            type="button"
            class="settings-menu-item"
            class:active={settingsSection === 'general'}
            onclick={() => selectSettingsSection('general')}
          >
            Настройки
          </button>
          <button
            type="button"
            class="settings-menu-item"
            class:active={settingsSection === 'plugins'}
            onclick={() => selectSettingsSection('plugins')}
          >
            Плагины
          </button>
        </nav>
        <div class="settings-pages">
          <div class="settings-page" class:hidden={settingsSection !== 'general'}>
            <PluginFrame src="/plugins/settings-ui/index.html" title="Settings plugin" />
          </div>
          <div class="settings-page" class:hidden={settingsSection !== 'plugins'}>
            <PluginFrame src="/plugins/plugin-store-ui/index.html" title="Plugin store" />
          </div>
        </div>
      </div>
    </main>
    <aside class="notifications-panel-host" class:hidden={!notificationsOpen}>
      <PluginFrame
        src="/plugins/notifications-ui/index.html"
        title="Notifications plugin"
        onMessage={handlePluginMessage}
      />
    </aside>
  </div>
</div>

<style>
  .app-root {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .app-header {
    flex: 0 0 48px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    background: #fff;
    border-bottom: 1px solid #e0e0e0;
  }

  .app-title {
    font-size: 16px;
    font-weight: bold;
    color: #315f9e;
  }

  .app-section {
    color: #555;
    font-size: 14px;
  }

  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .icon-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid #5a8fda;
    border-radius: 6px;
    background: #fff;
    color: #315f9e;
    cursor: pointer;
  }

  .icon-button:hover {
    background: #eef5ff;
  }

  .count-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: #4caf50;
    color: #fff;
    font-size: 11px;
    font-weight: bold;
  }

  .count-badge.muted {
    background: #d7dde3;
    color: #5a6b7b;
  }

  .app-body {
    flex: 1 1 auto;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  .app-content {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
  }

  .content-pane {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .content-pane.hidden {
    display: none;
  }

  .settings-view {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
  }

  .settings-view.hidden {
    display: none;
  }

  .settings-menu {
    flex: 0 0 200px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-right: 1px solid #e0e0e0;
    background: #fafbfc;
  }

  .settings-menu-item {
    text-align: left;
    padding: 8px 12px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #315f9e;
    font: inherit;
    cursor: pointer;
  }

  .settings-menu-item:hover {
    background: #eef5ff;
  }

  .settings-menu-item.active {
    background: #e6efff;
    border-color: #b9cff2;
    font-weight: bold;
  }

  .settings-pages {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
  }

  .settings-page {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .settings-page.hidden {
    display: none;
  }

  .notifications-panel-host {
    flex: 0 0 500px;
    min-width: 0;
    display: flex;
    border-left: 1px solid #e0e0e0;
  }

  .notifications-panel-host.hidden {
    display: none;
  }

  @media (max-width: 899px) {
    .notifications-panel-host {
      position: fixed;
      top: 48px;
      left: 0;
      right: 0;
      bottom: 0;
      flex: none;
      z-index: 1000;
      border-left: none;
    }
  }
</style>
