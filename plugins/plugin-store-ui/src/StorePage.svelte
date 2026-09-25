<script lang="ts">
  import { Badge, Button, Card, Input, Select } from '@booklib/ui';
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

<div class="flex flex-col gap-[var(--space-4)] p-[var(--space-4)]">
  <Card>
    <div class="mb-[var(--space-3)] flex items-start justify-between gap-[var(--space-3)]">
      <h2 class="text-base font-semibold">Установленные плагины</h2>
      <Button variant="secondary" onclick={onInstall}>Установить из файла</Button>
    </div>
    {#if notice}
      <p class="mb-[var(--space-3)] text-[13px] text-[var(--color-primary)]">{notice}</p>
    {/if}
    {#if plugins.length === 0}
      <div class="p-[var(--space-4)] text-center text-[var(--color-text-muted)]">
        Нет установленных плагинов
      </div>
    {:else}
      <ul class="flex list-none flex-col gap-[var(--space-2)] p-0">
        {#each plugins as plugin (plugin.name)}
          <li
            class="flex items-center justify-between gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--space-2)]"
          >
            <div class="flex min-w-0 flex-col gap-[2px]">
              <span class="text-sm font-bold">{plugin.name}</span>
              <span class="text-xs text-[var(--color-text-muted)]">
                {plugin.kind} · контракт v{plugin.contract_version}
              </span>
              {#if plugin.description}
                <span class="text-xs text-[var(--color-text-muted)]">{plugin.description}</span>
              {/if}
            </div>
            <Button variant="danger" size="sm" onclick={() => onUninstall(plugin.name)}>
              Удалить
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>

  <Card>
    <h2 class="mb-[var(--space-3)] text-base font-semibold">Сторы</h2>
    {#if stores.length === 0}
      <div class="p-[var(--space-3)] text-center text-[var(--color-text-muted)]">
        Сторы не подключены
      </div>
    {:else}
      <ul class="flex list-none flex-col gap-[var(--space-2)] p-0">
        {#each stores as store (store.id)}
          <li
            class="flex items-center justify-between gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--space-2)]"
          >
            <div class="flex min-w-0 flex-col gap-[2px]">
              <span class="text-sm font-bold">{store.title}</span>
              <span class="text-xs text-[var(--color-text-muted)]">
                {store.kind} · {store.location || '—'}
              </span>
            </div>
            <div class="flex gap-[var(--space-2)]">
              <Button variant="secondary" size="sm" onclick={() => onShowAvailable(store.id)}>
                Пакеты
              </Button>
              <Button variant="danger" size="sm" onclick={() => onRemoveStore(store.id)}>
                Удалить
              </Button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if unsupported}
      <p class="mt-[var(--space-3)] text-[13px] text-[var(--color-text-muted)]">{unsupported}</p>
    {/if}
    {#if packages.length > 0}
      <ul class="mt-[var(--space-3)] flex list-none flex-col gap-[var(--space-2)] p-0">
        {#each packages as item (item.name)}
          <li
            class="flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--space-2)]"
          >
            <span class="text-sm font-bold">{item.name}</span>
            <Badge>{item.version || '—'}</Badge>
            <span class="text-xs text-[var(--color-text-muted)]">{item.description || ''}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
      <Input placeholder="Идентификатор" bind:value={storeId} class="max-w-[180px]" />
      <Select bind:value={storeKind} class="max-w-[120px]">
        <option value="file">file</option>
        <option value="network">network</option>
      </Select>
      <Input placeholder="Название" bind:value={storeTitle} class="max-w-[180px]" />
      <Input placeholder="Каталог или адрес" bind:value={storeLocation} class="max-w-[240px]" />
      <Button variant="primary" onclick={submitStore}>Добавить стор</Button>
    </div>
  </Card>
</div>
