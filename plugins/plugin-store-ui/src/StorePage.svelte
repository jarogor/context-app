<script lang="ts">
  import type { InstalledPlugin, Store, StorePackage } from './types';

  interface Props {
    plugins: InstalledPlugin[];
    stores: Store[];
    packages: StorePackage[];
    unsupported: string;
    notice: string;
    onInstall: () => void;
    onUninstall: (name: string) => void;
    onAddStore: (store: { id: string; kind: string; title: string; location: string }) => void;
    onRemoveStore: (id: string) => void;
    onShowAvailable: (id: string) => void;
  }

  let {
    plugins,
    stores,
    packages,
    unsupported,
    notice,
    onInstall,
    onUninstall,
    onAddStore,
    onRemoveStore,
    onShowAvailable,
  }: Props = $props();

  let storeId = $state('');
  let storeKind = $state('file');
  let storeTitle = $state('');
  let storeLocation = $state('');

  /** Добавление стора из формы. */
  function submitStore() {
    if (!storeId.trim()) return;
    onAddStore({
      id: storeId.trim(),
      kind: storeKind,
      title: storeTitle.trim() || storeId.trim(),
      location: storeLocation.trim(),
    });
    storeId = '';
    storeTitle = '';
    storeLocation = '';
  }
</script>

<div class="store-content">
  <section class="store-section">
    <div class="section-header">
      <h2>Установленные плагины</h2>
      <button type="button" onclick={onInstall}>Установить из файла</button>
    </div>
    {#if notice}
      <p class="notice">{notice}</p>
    {/if}
    {#if plugins.length === 0}
      <div class="empty-state">Нет установленных плагинов</div>
    {:else}
      <ul class="plugin-list">
        {#each plugins as plugin (plugin.name)}
          <li class="plugin-item">
            <div class="plugin-info">
              <span class="plugin-name">{plugin.name}</span>
              <span class="plugin-meta">{plugin.kind} · контракт v{plugin.contract_version}</span>
              {#if plugin.description}
                <span class="plugin-description">{plugin.description}</span>
              {/if}
            </div>
            <button type="button" class="danger" onclick={() => onUninstall(plugin.name)}>
              Удалить
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="store-section">
    <h2>Сторы</h2>
    {#if stores.length === 0}
      <div class="empty-state">Сторы не подключены</div>
    {:else}
      <ul class="store-list">
        {#each stores as store (store.id)}
          <li class="store-item">
            <div class="plugin-info">
              <span class="plugin-name">{store.title}</span>
              <span class="plugin-meta">{store.kind} · {store.location || '—'}</span>
            </div>
            <div class="store-actions">
              <button type="button" onclick={() => onShowAvailable(store.id)}>Пакеты</button>
              <button type="button" class="danger" onclick={() => onRemoveStore(store.id)}>
                Удалить
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if unsupported}
      <p class="notice">{unsupported}</p>
    {/if}
    {#if packages.length > 0}
      <ul class="package-list">
        {#each packages as item (item.name)}
          <li class="package-item">
            <span class="plugin-name">{item.name}</span>
            <span class="plugin-meta">{item.version || '—'} · {item.description || ''}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="store-form">
      <input placeholder="Идентификатор" bind:value={storeId} />
      <select bind:value={storeKind}>
        <option value="file">file</option>
        <option value="network">network</option>
      </select>
      <input placeholder="Название" bind:value={storeTitle} />
      <input placeholder="Каталог или адрес" bind:value={storeLocation} />
      <button type="button" onclick={submitStore}>Добавить стор</button>
    </div>
  </section>
</div>

<style>
  .store-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .store-section {
    padding: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: #fff;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .store-section h2 {
    margin: 0 0 12px;
    font-size: 16px;
  }

  .section-header h2 {
    margin: 0;
  }

  .notice {
    margin: 0 0 12px;
    color: #315f9e;
    font-size: 13px;
  }

  .plugin-list,
  .store-list,
  .package-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .plugin-item,
  .store-item,
  .package-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border: 1px solid #ececec;
    border-radius: 6px;
  }

  .plugin-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .plugin-name {
    font-size: 14px;
    font-weight: bold;
    color: #333;
  }

  .plugin-meta {
    font-size: 12px;
    color: #777;
  }

  .plugin-description {
    font-size: 12px;
    color: #555;
  }

  .store-actions {
    display: flex;
    gap: 8px;
  }

  button {
    padding: 6px 12px;
    border: 1px solid #5a8fda;
    border-radius: 6px;
    background: #fff;
    color: #315f9e;
    font: inherit;
    cursor: pointer;
  }

  button:hover {
    background: #eef5ff;
  }

  button.danger {
    border-color: #d98a8a;
    color: #a33;
  }

  button.danger:hover {
    background: #fdecea;
  }

  .store-form {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .store-form input,
  .store-form select {
    box-sizing: border-box;
    padding: 7px 9px;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    font: inherit;
  }

  .empty-state {
    text-align: center;
    color: #999;
    padding: 16px;
  }
</style>
