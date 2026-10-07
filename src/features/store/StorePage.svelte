<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Badge, Button, Card, Checkbox, ErrorToast, IconButton, Input, Select, createAsyncState } from '@texture/ui';
  import { listenEvent, openDialog } from '../../shared/app-bridge';
  import {
    addStore as addStoreEntry,
    installPluginFromFile,
    listStorePackages,
    loadActivationPending,
    loadStoreCatalog,
    removeStore as removeStoreEntry,
    setPluginEnabled,
    uninstallPlugin,
    type PluginEntry,
    type Store,
    type StorePackage,
  } from './plugin-store';

  interface Props {
    /** Передача оболочке признака неприменённых изменений активности. */
    onPendingChange?: (pending: boolean) => void;
    /** Перечень плагинов, загруженный на бутстрапе; `undefined` — загрузить самим. */
    initialPlugins?: PluginEntry[];
    /** Реестр сторов, загруженный на бутстрапе; `undefined` — загрузить самим. */
    initialStores?: Store[];
    /** Признак неприменённых изменений активности, загруженный на бутстрапе. */
    initialPending?: boolean;
    /** Ошибка загрузки каталога на бутстрапе. */
    initialError?: string;
  }

  let {
    onPendingChange,
    initialPlugins,
    initialStores,
    initialPending,
    initialError,
  }: Props = $props();

  /** Варианты вида стора для выпадающего списка. */
  const STORE_KIND_OPTIONS = [
    { value: 'file', label: 'file' },
    { value: 'network', label: 'network' },
  ];

  /** Перечень отключаемых плагинов. */
  let plugins: PluginEntry[] = $state(untrack(() => initialPlugins ?? []));

  /** Реестр подключённых сторов. */
  let stores: Store[] = $state(untrack(() => initialStores ?? []));

  /** Пакеты выбранного стора. */
  let packages: StorePackage[] = $state([]);

  /** Сообщение о неподдержке сетевого стора. */
  let unsupported: string = $state('');

  /** Ошибка операции стора. */
  const asyncState = createAsyncState();

  // Ошибка, переданная с бутстрапа, показывается сразу при монтировании.
  asyncState.error = untrack(() => initialError ?? '');

  /** Черновик формы добавления стора. */
  let storeId = $state('');

  /** Вид добавляемого стора. */
  let storeKind = $state('file');

  /** Название добавляемого стора. */
  let storeTitle = $state('');

  /** Расположение добавляемого стора. */
  let storeLocation = $state('');

  /** Рабочие плагины без образцов для разработчика. */
  const regularPlugins = $derived(plugins.filter((plugin) => !plugin.sample));

  /** Образцы для разработчика, показываются отдельной группой в конце. */
  const samplePlugins = $derived(plugins.filter((plugin) => plugin.sample));

  /** Сообщение оболочке о наличии неприменённых изменений активности. */
  function publishPending(pending: boolean) {
    onPendingChange?.(pending);
  }

  /** Загрузка перечня плагинов, реестра сторов и признака изменений. */
  async function load() {
    const catalog = await asyncState.run(loadStoreCatalog);
    if (catalog) {
      plugins = catalog.plugins;
      stores = catalog.stores;
    }
    try {
      publishPending(await loadActivationPending());
    } catch {
      // Отсутствие признака не мешает работе страницы.
    }
  }

  /** Переключение активности плагина. */
  async function setEnabled(id: string, enabled: boolean) {
    await asyncState.run(async () => {
      await setPluginEnabled(id, enabled);
      await load();
    });
  }

  /** Установка пакета из выбранного zip-файла. */
  async function installFromFile() {
    await asyncState.run(async () => {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: 'Пакет плагина', extensions: ['zip'] }],
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (typeof path !== 'string' || !path) {
        return;
      }
      await installPluginFromFile(path);
      await load();
    });
  }

  /** Удаление установленного плагина. */
  async function uninstall(id: string) {
    await asyncState.run(async () => {
      await uninstallPlugin(id);
      await load();
    });
  }

  /** Добавление стора из формы. */
  async function addStore() {
    if (!storeId.trim()) {
      return;
    }
    await asyncState.run(async () => {
      await addStoreEntry({
        id: storeId.trim(),
        kind: storeKind,
        title: storeTitle.trim() || storeId.trim(),
        location: storeLocation.trim(),
      });
      storeId = '';
      storeTitle = '';
      storeLocation = '';
      await load();
    });
  }

  /** Удаление стора из реестра. */
  async function removeStore(id: string) {
    await asyncState.run(async () => {
      await removeStoreEntry(id);
      packages = [];
      unsupported = '';
      await load();
    });
  }

  /** Показ пакетов, предлагаемых стором. */
  async function showAvailable(id: string) {
    unsupported = '';
    packages = [];
    const result = await asyncState.run(() => listStorePackages(id));
    if (!result) {
      return;
    }
    if (!result.supported) {
      unsupported = 'Сетевой стор пока не поддерживается';
      return;
    }
    packages = result.packages;
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    // Признак изменений сообщаем оболочке синхронно: он рисуется в шапке.
    if (initialPending !== undefined) {
      publishPending(initialPending);
    }
    void (async () => {
      unlisten = await listenEvent('plugin-store:changed', () => {
        void load();
      });
      // Данные уже загружены на бутстрапе; без них (в изоляции) грузим сами.
      if (initialPlugins === undefined || initialStores === undefined) {
        await load();
      }
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<div class="flex flex-col gap-4 p-4">
  <Card>
    <div class="mb-3 flex items-start justify-between gap-3">
      <h2 class="text-base font-semibold">Плагины</h2>
      <Button variant="secondary" onclick={installFromFile}>Установить из файла</Button>
    </div>
    {#if plugins.length === 0}
      <div class="p-4 text-center text-[var(--muted-foreground)]">
        Нет плагинов
      </div>
    {:else}
      <ul class="flex list-none flex-col gap-2 p-0">
        {#each regularPlugins as plugin (plugin.id)}
          <li
            class="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-2"
          >
            <label class="flex min-w-0 items-center gap-2">
              <Checkbox
                checked={plugin.enabled}
                onchange={(event) => setEnabled(plugin.id, event.currentTarget.checked)}
              />
              <span class="flex min-w-0 flex-col gap-[2px]">
                <span class="flex flex-wrap items-baseline gap-2">
                  <span class="text-sm font-bold">{plugin.name}</span>
                  <span class="font-mono text-xs text-[var(--muted-foreground)]">{plugin.id}</span>
                </span>
                <span class="text-xs text-[var(--muted-foreground)]">{plugin.kind}</span>
                {#if plugin.description}
                  <span class="text-xs text-[var(--muted-foreground)]">{plugin.description}</span>
                {/if}
              </span>
            </label>
            {#if plugin.removable}
              <IconButton
                action="delete"
                title="Удалить плагин"
                ariaLabel="Удалить плагин"
                onclick={() => uninstall(plugin.id)}
              />
            {/if}
          </li>
        {/each}
      </ul>

      {#if samplePlugins.length > 0}
        <details class="mt-3 border-t border-[var(--border)] pt-3">
          <summary class="cursor-pointer text-xs text-[var(--muted-foreground)]">
            Образцы для разработчика ({samplePlugins.length})
          </summary>
          <ul class="mt-2 flex list-none flex-col gap-2 p-0">
            {#each samplePlugins as plugin (plugin.id)}
              <li
                class="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-2 opacity-70"
              >
                <label class="flex min-w-0 items-center gap-2">
                  <Checkbox
                    checked={plugin.enabled}
                    onchange={(event) => setEnabled(plugin.id, event.currentTarget.checked)}
                  />
                  <span class="flex min-w-0 flex-col gap-[2px]">
                    <span class="flex flex-wrap items-baseline gap-2">
                      <span class="text-sm font-bold">{plugin.name}</span>
                      <Badge>образец</Badge>
                    </span>
                    {#if plugin.description}
                      <span class="text-xs text-[var(--muted-foreground)]">{plugin.description}</span>
                    {/if}
                  </span>
                </label>
                {#if plugin.removable}
                  <IconButton
                    action="delete"
                    title="Удалить плагин"
                    ariaLabel="Удалить плагин"
                    onclick={() => uninstall(plugin.id)}
                  />
                {/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    {/if}
  </Card>

  <Card>
    <h2 class="mb-3 text-base font-semibold">Сторы</h2>
    {#if stores.length === 0}
      <div class="p-3 text-center text-[var(--muted-foreground)]">
        Сторы не подключены
      </div>
    {:else}
      <ul class="flex list-none flex-col gap-2 p-0">
        {#each stores as store (store.id)}
          <li
            class="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-2"
          >
            <div class="flex min-w-0 flex-col gap-[2px]">
              <span class="text-sm font-bold">{store.title}</span>
              <span class="text-xs text-[var(--muted-foreground)]">
                {store.kind} · {store.location || '—'}
              </span>
            </div>
            <div class="flex gap-2">
              <Button variant="secondary" size="sm" onclick={() => showAvailable(store.id)}>
                Пакеты
              </Button>
              <IconButton
                action="delete"
                title="Удалить стор"
                ariaLabel="Удалить стор"
                onclick={() => removeStore(store.id)}
              />
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if unsupported}
      <p class="mt-3 text-[13px] text-[var(--muted-foreground)]">{unsupported}</p>
    {/if}
    {#if packages.length > 0}
      <ul class="mt-3 flex list-none flex-col gap-2 p-0">
        {#each packages as item (item.name)}
          <li
            class="flex items-center gap-2 rounded-md border border-[var(--border)] p-2"
          >
            <span class="text-sm font-bold">{item.name}</span>
            <Badge>{item.version || '—'}</Badge>
            <span class="text-xs text-[var(--muted-foreground)]">{item.description || ''}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="mt-3 flex flex-wrap gap-2">
      <Input placeholder="Идентификатор" bind:value={storeId} class="max-w-[180px]" />
      <Select
        bind:value={storeKind}
        items={STORE_KIND_OPTIONS}
        ariaLabel="Вид стора"
        class="max-w-[120px]"
      />
      <Input placeholder="Название" bind:value={storeTitle} class="max-w-[180px]" />
      <Input placeholder="Каталог или адрес" bind:value={storeLocation} class="max-w-[240px]" />
      <Button variant="primary" onclick={addStore}>Добавить стор</Button>
    </div>
  </Card>
</div>

<ErrorToast message={asyncState.error} />
