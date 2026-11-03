<script lang="ts">
  import App from './App.svelte';
  import BootstrapLoading from '../features/lifecycle/BootstrapLoading.svelte';
  import BootstrapError from '../features/lifecycle/BootstrapError.svelte';
  import {
    loadBootstrap,
    type ActiveLibrary,
    type AppearanceBootstrap,
    type SettingsBootstrap,
    type StoreBootstrap,
  } from '../features/lifecycle/bootstrap';
  import type { UpdateBootstrap } from '../features/update/update';
  import { normalizeRegistry } from '../features/workplace/workspace-registry';
  import { DEFAULT_OPEN_TABS_LIMIT } from '../features/workplace/workplace';
  import { DEFAULT_PALETTE, DEFAULT_READER_FONT, DEFAULT_READER_THEME } from '@context/ui';
  import { DEFAULT_LOCALE } from '@context/i18n';

  /** Фаза начальной загрузки приложения. */
  type Phase = 'boot' | 'ready' | 'error';

  /** Текущая фаза: загрузка, готовность или ошибка загрузки. */
  let phase = $state<Phase>('boot');

  /** Сообщение об ошибке загрузки. */
  let bootstrapError = $state<string | null>(null);

  /** Снимок реестра рабочих мест, переданный оболочке при запуске. */
  let initialRegistry: unknown = $state(null);

  /** Сведения об активной библиотеке, переданные оболочке при запуске. */
  let initialLibrary: ActiveLibrary | null = $state(null);

  /** Оформление, применённое до первого рендера. */
  let initialAppearance: AppearanceBootstrap = $state({
    theme: 'system',
    palette: DEFAULT_PALETTE,
    readerTheme: DEFAULT_READER_THEME,
    readerFont: DEFAULT_READER_FONT,
    locale: DEFAULT_LOCALE,
  });

  /** Декларации настроек, загруженные до первого рендера. */
  let initialSettings: SettingsBootstrap = $state({ declarations: [], error: '' });

  /** Каталог плагинов и сторов, загруженный до первого рендера. */
  let initialStore: StoreBootstrap = $state({
    plugins: [],
    stores: [],
    activationPending: false,
    error: '',
  });

  /** Лимит открытых вкладок рабочего места, загруженный до первого рендера. */
  let initialOpenTabsLimit = $state(DEFAULT_OPEN_TABS_LIMIT);

  /** Состояние обновлений, загруженное до первого рендера. */
  let initialUpdate: UpdateBootstrap = $state({ status: null, error: '' });

  /** Счётчик повторных попыток: перезапускает эффект загрузки. */
  let attempt = $state(0);

  /** Повторная попытка начальной загрузки после ошибки. */
  function retry() {
    phase = 'boot';
    bootstrapError = null;
    attempt += 1;
  }

  // Загрузка состояния до показа оболочки: оболочка монтируется только при
  // `phase === 'ready'`, поэтому первый её рендер уже содержит список рабочих
  // мест. Эффект зависит от `attempt`, что позволяет повторить загрузку.
  $effect(() => {
    void attempt;
    if (phase !== 'boot') {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const state = await loadBootstrap();
        if (!active) {
          return;
        }
        initialRegistry = state.registry;
        initialLibrary = state.activeLibrary;
        initialAppearance = state.appearance;
        initialSettings = state.settings;
        initialStore = state.store;
        initialOpenTabsLimit = state.openTabsLimit;
        initialUpdate = state.update;
        phase = 'ready';
      } catch (error) {
        if (!active) {
          return;
        }
        bootstrapError = String(error);
        phase = 'error';
      }
    })();
    return () => {
      active = false;
    };
  });

  /** Реестр начального состояния для оболочки. */
  const registry = $derived(normalizeRegistry(initialRegistry));
</script>

{#if phase === 'ready'}
  <App
    initialRegistry={registry}
    initialLibrary={initialLibrary}
    initialAppearance={initialAppearance}
    initialSettings={initialSettings}
    initialStore={initialStore}
    initialOpenTabsLimit={initialOpenTabsLimit}
    initialUpdate={initialUpdate}
  />
{:else if phase === 'error'}
  <BootstrapError error={bootstrapError} onRetry={retry} />
{:else}
  <BootstrapLoading />
{/if}
