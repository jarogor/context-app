<script lang="ts">
  import { onMount } from 'svelte';
  import type { InstalledPlugin, Store, StorePackage } from './types';
  import { listen, operation, pickPackage } from './bridge';
  import StorePage from './StorePage.svelte';

  let plugins: InstalledPlugin[] = $state([]);
  let stores: Store[] = $state([]);
  let packages: StorePackage[] = $state([]);
  let unsupported: string = $state('');
  let errorMessage: string = $state('');
  let notice: string = $state('');

  /** Загрузка установленных плагинов и реестра сторов. */
  async function load() {
    try {
      const installed = await operation<{ plugins: InstalledPlugin[] }>('list', {});
      plugins = installed.plugins;
      const registry = await operation<{ stores: Store[] }>('stores_list', {});
      stores = registry.stores;
      errorMessage = '';
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
      notice = 'Плагин установлен. Переоткройте библиотеку, чтобы он загрузился.';
      await load();
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Удаление установленного плагина. */
  async function uninstall(name: string) {
    try {
      await operation('uninstall', { name });
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
  {notice}
  onInstall={installFromFile}
  onUninstall={uninstall}
  onAddStore={addStore}
  onRemoveStore={removeStore}
  onShowAvailable={showAvailable}
/>

{#if errorMessage}
  <div class="plugin-error" role="alert">{errorMessage}</div>
{/if}

<style>
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
