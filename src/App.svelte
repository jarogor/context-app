<script lang="ts">
  import { Button, Menu, MenuItem } from '@booklib/ui';
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

<div class="flex h-full flex-col">
  <header
    class="flex flex-[0_0_48px] items-center gap-[var(--space-3)] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)]"
  >
    <span class="text-base font-bold text-[var(--color-primary)]">BookLib</span>
    <span class="text-sm text-[var(--color-text-muted)]">{sectionTitle}</span>
    <div class="ml-auto flex items-center gap-[var(--space-2)]">
      <Button
        variant="secondary"
        size="icon"
        title="Уведомления"
        ariaLabel="Уведомления"
        class="relative"
        onclick={toggleNotifications}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-5v-1l-1.7-1.7V10a5.3 5.3 0 0 0-4-5.2V4a1.3 1.3 0 0 0-2.6 0v.8A5.3 5.3 0 0 0 6.7 10v4.3L5 16v1Z"
            fill="currentColor"
          />
        </svg>
        <span
          class="absolute -top-[6px] -right-[6px] flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] text-[11px] font-bold text-[var(--color-primary-fg)]"
          style:background={unreadCount === 0
            ? 'var(--color-border-strong)'
            : 'var(--color-success)'}
        >
          {unreadCount}
        </span>
      </Button>
      <Button
        variant="secondary"
        size="icon"
        title="Настройки"
        ariaLabel="Настройки"
        onclick={toggleSettings}
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
      </Button>
    </div>
  </header>

  <div class="flex min-h-0 flex-1 overflow-hidden">
    <main class="flex min-w-0 flex-1">
      <div class="min-h-0 min-w-0 flex-1" class:hidden={settingsOpen}>
        <PluginFrame src="/plugins/library-ui/index.html" title="Library plugin" />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!settingsOpen}>
        <Menu
          ariaLabel="Разделы настроек"
          class="flex-[0_0_200px] border-r border-[var(--color-border)] bg-[var(--color-bg)] p-[var(--space-3)]"
        >
          <MenuItem active={settingsSection === 'general'} onclick={() => selectSettingsSection('general')}>
            Настройки
          </MenuItem>
          <MenuItem active={settingsSection === 'plugins'} onclick={() => selectSettingsSection('plugins')}>
            Плагины
          </MenuItem>
        </Menu>
        <div class="flex min-h-0 min-w-0 flex-1">
          <div class="min-h-0 min-w-0 flex-1" class:hidden={settingsSection !== 'general'}>
            <PluginFrame src="/plugins/settings-ui/index.html" title="Settings plugin" />
          </div>
          <div class="min-h-0 min-w-0 flex-1" class:hidden={settingsSection !== 'plugins'}>
            <PluginFrame src="/plugins/plugin-store-ui/index.html" title="Plugin store" />
          </div>
        </div>
      </div>
    </main>
    <aside
      class="flex min-w-0 flex-[0_0_500px] border-l border-[var(--color-border)] max-[899px]:fixed max-[899px]:inset-x-0 max-[899px]:top-[48px] max-[899px]:bottom-0 max-[899px]:z-[1000] max-[899px]:flex-none max-[899px]:border-l-0"
      class:hidden={!notificationsOpen}
    >
      <PluginFrame
        src="/plugins/notifications-ui/index.html"
        title="Notifications plugin"
        onMessage={handlePluginMessage}
      />
    </aside>
  </div>
</div>
