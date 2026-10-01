<script lang="ts">
  import App from './App.svelte';
  import BootstrapLoading from './lib/BootstrapLoading.svelte';
  import BootstrapError from './lib/BootstrapError.svelte';
  import { loadBootstrap, type ActiveLibrary } from './lib/bootstrap';
  import { normalizeRegistry } from './lib/workspace-registry';

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
  <App initialRegistry={registry} initialLibrary={initialLibrary} />
{:else if phase === 'error'}
  <BootstrapError error={bootstrapError} onRetry={retry} />
{:else}
  <BootstrapLoading />
{/if}
