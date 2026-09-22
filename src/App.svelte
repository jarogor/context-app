<script lang="ts">
  import PluginFrame from './lib/PluginFrame.svelte';

  /** Состояние региона уведомлений, управляемое frontend-плагином. */
  type LayoutState = 'collapsed' | 'expanded' | 'page';

  let layoutState: LayoutState = $state('collapsed');

  /** Открыт ли раздел настроек; состояние принадлежит оболочке. */
  let settingsOpen = $state(false);

  interface LayoutValue {
    region: string;
    state: string;
  }

  /** Обработка сообщения плагина о требуемом состоянии региона уведомлений. */
  function handleLayout(value: LayoutValue) {
    if (value.region !== 'notifications') return;
    if (value.state === 'collapsed' || value.state === 'expanded' || value.state === 'page') {
      layoutState = value.state;
    }
  }

  /** Переключение между основным разделом и настройками. */
  function toggleSettings() {
    settingsOpen = !settingsOpen;
  }
</script>

<header class="app-header">
  <span class="app-title">BookLib</span>
  <span class="app-section">{settingsOpen ? 'Настройки' : 'Библиотека'}</span>
  <button class="settings-toggle" type="button" onclick={toggleSettings}>
    {settingsOpen ? 'Назад' : 'Настройки'}
  </button>
</header>

<div class="notifications-region {layoutState}">
  <PluginFrame
    src="/plugins/notifications-ui/index.html"
    title="Notifications plugin"
    onLayout={handleLayout}
  />
</div>

<main class="app-content {layoutState}" class:hidden={layoutState === 'page' && !settingsOpen}>
  <div class="content-pane" class:hidden={settingsOpen}>
    <PluginFrame src="/plugins/library-ui/index.html" title="Library plugin" />
  </div>
  <div class="content-pane" class:hidden={!settingsOpen}>
    <PluginFrame src="/plugins/settings-ui/index.html" title="Settings plugin" />
  </div>
</main>

<style>
  .app-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 48px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    background: #fff;
    border-bottom: 1px solid #e0e0e0;
    z-index: 1500;
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

  .settings-toggle {
    margin-left: auto;
    padding: 6px 14px;
    border: 1px solid #5a8fda;
    border-radius: 6px;
    background: #fff;
    color: #315f9e;
    font: inherit;
    cursor: pointer;
  }

  .settings-toggle:hover {
    background: #eef5ff;
  }

  .notifications-region {
    position: fixed;
    left: 0;
    top: 48px;
    bottom: 0;
    z-index: 1000;
    transition: width 0.2s ease;
  }

  .notifications-region.collapsed {
    width: 40px;
  }

  .notifications-region.expanded {
    width: 400px;
  }

  .notifications-region.page {
    top: 48px;
    width: 100vw;
    height: calc(100vh - 48px);
  }

  .app-content {
    position: fixed;
    top: 48px;
    right: 0;
    bottom: 0;
    left: 0;
    transition: margin-left 0.2s ease;
  }

  .app-content.collapsed {
    margin-left: 40px;
  }

  .app-content.expanded {
    margin-left: 400px;
  }

  .app-content.page {
    margin-left: 0;
  }

  .app-content.hidden {
    display: none;
  }

  .content-pane {
    height: 100%;
  }

  .content-pane.hidden {
    display: none;
  }
</style>
