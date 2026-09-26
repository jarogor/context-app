<script lang="ts">
  import { onMount } from 'svelte';
  import type { PluginEntry, Store, StorePackage } from './types';
  import { listen, operation, pendingChanges, pickPackage } from './bridge';
  import StorePage from './StorePage.svelte';

  let plugins: PluginEntry[] = $state([]);
  let stores: Store[] = $state([]);
  let packages: StorePackage[] = $state([]);
  let unsupported: string = $state('');
  let errorMessage: string = $state('');

  /** Сообщение оболочке о наличии неприменённых изменений активности. */
  async function publishPending() {
    try {
      const { pending } = await pendingChanges();
      window.parent.postMessage(
        { channel: 'texture-plugin', type: 'activation-pending', value: pending },
        '*',
      );
    } catch {
      // Отсутствие признака не мешает работе страницы.
    }
  }

  /** Загрузка перечня плагинов и реестра сторов. */
  async function load() {
    try {
      const catalog = await operation<{ plugins: PluginEntry[] }>('plugins', {});
      plugins = catalog.plugins;
      const registry = await operation<{ stores: Store[] }>('stores_list', {});
      stores = registry.stores;
      errorMessage = '';
    } catch (error) {
      errorMessage = String(error);
    }
    await publishPending();
  }

  /** Переключение активности плагина. */
  async function setEnabled(id: string, enabled: boolean) {
    try {
      await operation('set_enabled', { id, enabled });
      await load();
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Установка пакета из выбранного zip-файла. */
  async function installFromFile() {
    try {
      const path = await pickPackage();
      if (!path) return;
      await operation('install_file', { path });
      await load();
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Удаление установленного плагина. */
  async function uninstall(id: string) {
    try {
      await operation('uninstall', { id });
      await load();
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Добавление стора в реестр. */
  async function addStore(store: { id: string; kind: string; title: string; location: string }) {
    try {
      await operation('stores_add', { store });
      await load();
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Удаление стора из реестра. */
  async function removeStore(id: string) {
    try {
      await operation('stores_remove', { id });
      packages = [];
      unsupported = '';
      await load();
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Показ пакетов, предлагаемых стором. */
  async function showAvailable(id: string) {
    unsupported = '';
    packages = [];
    try {
      const result = await operation<{ supported: boolean; packages?: StorePackage[] }>(
        'available',
        { id },
      );
      if (!result.supported) {
        unsupported = 'Сетевой стор пока не поддерживается';
        return;
      }
      packages = result.packages ?? [];
    } catch (error) {
      errorMessage = String(error);
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen('plugin-store:changed', () => {
        void load();
      });
      await load();
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<StorePage
  {plugins}
  {stores}
  {packages}
  {unsupported}
  onInstall={installFromFile}
  onUninstall={uninstall}
  onSetEnabled={setEnabled}
  onAddStore={addStore}
  onRemoveStore={removeStore}
  onShowAvailable={showAvailable}
/>

{#if errorMessage}
  <div
    class="fixed right-[8px] bottom-[8px] left-[8px] z-10 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-[var(--space-2)] text-xs text-[var(--color-danger)]"
    role="alert"
  >
    {errorMessage}
  </div>
{/if}
