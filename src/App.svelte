<script lang="ts">
  import { onMount } from 'svelte';
  import { Badge, Button, Menu, MenuItem } from '@texture/ui';
  import PluginFrame from './lib/PluginFrame.svelte';
  import LibrariesPage from './lib/LibrariesPage.svelte';
  import { invokeCommand, listenEvent } from './lib/app-bridge';

  /** Сообщение frontend-плагина без идентификатора запроса. */
  interface PluginMessage {
    type?: string;
    value?: unknown;
  }

  /** Активная библиотека для отображения в шапке. */
  interface ActiveLibrary {
    /** Человекочитаемое имя провайдера. */
    provider_name?: string;
    /** Путь библиотеки. */
    path?: string;
  }

  /** Страница раздела настроек. */
  type SettingsSection = 'general' | 'plugins';

  /** Открыт ли раздел настроек; состояние принадлежит оболочке. */
  let settingsOpen = $state(false);

  /** Выбранная страница раздела настроек. */
  let settingsSection = $state<SettingsSection>('general');

  /** Открыта ли страница «Библиотеки»; состояние принадлежит оболочке. */
  let librariesOpen = $state(false);

  /** Открыта ли панель уведомлений; состояние принадлежит оболочке. */
  let notificationsOpen = $state(false);

  /** Число непрочитанных уведомлений, полученное от frontend-плагина. */
  let unreadCount = $state(0);

  /** Есть ли неприменённые изменения активности плагинов. */
  let activationPending = $state(false);

  /** Активная библиотека для шапки. */
  let activeLibrary: ActiveLibrary | null = $state(null);

  /** Имя активной библиотеки по последнему сегменту пути. */
  function libraryName(): string | null {
    const library = activeLibrary;
    if (!library?.path) {
      return null;
    }
    return library.path.split(/[\\/]/).filter(Boolean).pop() ?? library.path;
  }

  /** Показывать ли в шапке название активной библиотеки (основной раздел). */
  function showLibrary(): boolean {
    return !settingsOpen && !librariesOpen && activeLibrary !== null;
  }

  /** Название текущего раздела в верхней панели. */
  const sectionTitle = $derived(
    librariesOpen ? 'Библиотеки' : settingsOpen ? (settingsSection === 'plugins' ? 'Плагины' : 'Настройки') : 'Библиотека',
  );

  /** Переключение раздела настроек; закрывает страницу библиотек. */
  function toggleSettings() {
    settingsOpen = !settingsOpen;
    if (settingsOpen) {
      librariesOpen = false;
    }
  }

  /** Переключение страницы «Библиотеки»; закрывает настройки. */
  function toggleLibraries() {
    librariesOpen = !librariesOpen;
    if (librariesOpen) {
      settingsOpen = false;
    }
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

  /** Обработка сообщений плагина стора. */
  function handleStoreMessage(message: PluginMessage) {
    if (message.type === 'activation-pending') {
      activationPending = Boolean(message.value);
    }
  }

  /** Обновление сведений об активной библиотеке из ядра. */
  async function refreshActiveLibrary() {
    try {
      const result = (await invokeCommand('active_library', {})) as ActiveLibrary | null;
      activeLibrary = result?.path ? result : null;
    } catch {
      activeLibrary = null;
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('source-catalog-changed', (value) => {
        const payload = value as ActiveLibrary | null;
        if (payload?.path) {
          activeLibrary = payload;
        } else {
          void refreshActiveLibrary();
        }
      });
      await refreshActiveLibrary();
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<div class="flex h-full flex-col">
  <header
    class="flex flex-[0_0_48px] items-center gap-[var(--space-3)] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)]"
  >
    <span class="text-base font-bold text-[var(--color-primary)]">Текстура</span>
    {#if showLibrary()}
      {#if activeLibrary?.provider_name}
        <Badge>{activeLibrary.provider_name}</Badge>
      {/if}
      <span
        class="max-w-[280px] truncate text-sm text-[var(--color-text-muted)]"
        title={activeLibrary?.path ?? ''}
      >
        {libraryName()}
      </span>
    {:else}
      <span class="text-sm text-[var(--color-text-muted)]">{sectionTitle}</span>
    {/if}
    <div class="ml-auto flex items-center gap-[var(--space-2)]">
      {#if activationPending}
        <span
          class="whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--color-warning)] px-[var(--space-2)] py-[2px] text-[12px] text-[var(--color-warning)]"
          title="Изменения плагинов применятся после перезапуска приложения или переоткрытия библиотеки"
        >
          Нужен перезапуск
        </span>
      {/if}
      <Button
        variant={notificationsOpen ? 'primary' : 'secondary'}
        size="icon"
        title="Уведомления"
        ariaLabel="Уведомления"
        ariaPressed={notificationsOpen}
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
        variant={librariesOpen ? 'primary' : 'secondary'}
        size="icon"
        title="Библиотеки"
        ariaLabel="Библиотеки"
        ariaPressed={librariesOpen}
        onclick={toggleLibraries}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="4" y="3.5" width="4.5" height="17" rx="1" fill="currentColor" />
          <rect x="10" y="3.5" width="4.5" height="17" rx="1" fill="currentColor" />
          <path
            d="M16.2 4.3a1 1 0 0 1 1.25.7l3.1 14.2a1 1 0 0 1-.75 1.2l-1.9.45a1 1 0 0 1-1.2-.75L13.6 5.9a1 1 0 0 1 .75-1.2Z"
            fill="currentColor"
          />
        </svg>
      </Button>
      <Button
        variant={settingsOpen ? 'primary' : 'secondary'}
        size="icon"
        title="Настройки"
        ariaLabel="Настройки"
        ariaPressed={settingsOpen}
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
      <div class="min-h-0 min-w-0 flex-1" class:hidden={settingsOpen || librariesOpen}>
        <PluginFrame src="/plugins/library-ui/index.html" title="Library plugin" />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1" class:hidden={!librariesOpen}>
        <LibrariesPage onOpened={() => (librariesOpen = false)} />
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
            <PluginFrame
              src="/plugins/plugin-store-ui/index.html"
              title="Plugin store"
              onMessage={handleStoreMessage}
            />
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
