<script lang="ts">
  import PluginFrame from './lib/PluginFrame.svelte';

  /** Состояние региона уведомлений, управляемое frontend-плагином. */
  type LayoutState = 'collapsed' | 'expanded' | 'page';

  let layoutState: LayoutState = $state('collapsed');

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
</script>

<div class="notifications-region {layoutState}">
  <PluginFrame
    src="/plugins/notifications-ui/index.html"
    title="Notifications plugin"
    onLayout={handleLayout}
  />
</div>

<main class="app-content {layoutState}" class:hidden={layoutState === 'page'}>
  <PluginFrame src="/plugins/library-ui/index.html" title="Library plugin" />
</main>

<style>
  .notifications-region {
    position: fixed;
    left: 0;
    top: 0;
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
    width: 100vw;
    height: 100vh;
  }

  .app-content {
    min-height: 100vh;
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
</style>
