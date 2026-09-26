<script lang="ts">
  import { Badge, Button, Card, Checkbox, Input, Select } from '@booklib/ui';
  import type { PluginEntry, Store, StorePackage } from './types';

  interface Props {
    plugins: PluginEntry[];
    stores: Store[];
    packages: StorePackage[];
    unsupported: string;
    onInstall: () => void;
    onUninstall: (id: string) => void;
    onSetEnabled: (id: string, enabled: boolean) => void;
    onAddStore: (store: { id: string; kind: string; title: string; location: string }) => void;
    onRemoveStore: (id: string) => void;
    onShowAvailable: (id: string) => void;
  }

  let {
    plugins,
    stores,
    packages,
    unsupported,
    onInstall,
    onUninstall,
    onSetEnabled,
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
      <h2 class="text-base font-semibold">Плагины</h2>
      <Button variant="secondary" onclick={onInstall}>Установить из файла</Button>
    </div>
    {#if plugins.length === 0}
      <div class="p-[var(--space-4)] text-center text-[var(--color-text-muted)]">
        Нет плагинов
      </div>
    {:else}
      <ul class="flex list-none flex-col gap-[var(--space-2)] p-0">
        {#each plugins as plugin (plugin.id)}
          <li
            class="flex items-center justify-between gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--space-2)]"
          >
            <label class="flex min-w-0 items-center gap-[var(--space-2)]">
              <Checkbox
                checked={plugin.enabled}
                onchange={(event) => onSetEnabled(plugin.id, event.currentTarget.checked)}
              />
              <span class="flex min-w-0 flex-col gap-[2px]">
                <span class="flex flex-wrap items-baseline gap-[var(--space-2)]">
                  <span class="text-sm font-bold">{plugin.name}</span>
                  <span class="font-mono text-xs text-[var(--color-text-muted)]">{plugin.id}</span>
                </span>
                <span class="text-xs text-[var(--color-text-muted)]">{plugin.kind}</span>
                {#if plugin.description}
                  <span class="text-xs text-[var(--color-text-muted)]">{plugin.description}</span>
                {/if}
              </span>
            </label>
            {#if plugin.removable}
              <Button variant="danger" size="sm" onclick={() => onUninstall(plugin.id)}>
                Удалить
              </Button>
            {/if}
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
