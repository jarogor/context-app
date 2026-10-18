<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    Badge,
    Button,
    Card,
    Checkbox,
    ErrorToast,
    Icon,
    IconButton,
    Input,
    Select,
    ScrollArea,
    createAsyncState,
  } from '@texture/ui';
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

  /** Идёт ли установка плагина из файла. */
  let installing = $state(false);

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
    installing = true;
    try {
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
    } finally {
      installing = false;
    }
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

<ScrollArea testId="store-page" class="p-4 md:p-6">
  <div class="mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-5">
    <Card class="p-5">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
          <h2 class="role-heading">Плагины</h2>
          <span class="role-caption text-[var(--muted-foreground)]"
            >Отключите ненужные; изменения применятся после перезапуска</span
          >
        </div>
        <Button variant="secondary" disabled={installing} onclick={installFromFile}>
          <Icon name="plus" />
          Установить из файла
        </Button>
      </div>
      {#if plugins.length === 0}
        <div class="p-4 text-center role-body text-[var(--muted-foreground)]">Нет плагинов</div>
      {:else}
        <ul class="flex list-none flex-col gap-2 p-0" data-testid="store-plugins">
          {#each plugins as plugin (plugin.id)}
            <li
              class="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-2.5"
            >
              <label class="flex min-w-0 flex-1 items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={plugin.enabled}
                  onchange={(event) => setEnabled(plugin.id, event.currentTarget.checked)}
                />
                <span class="flex min-w-0 flex-col gap-[0.125rem]">
                  <span class="role-title">{plugin.name}</span>
                  {#if plugin.description}
                    <span class="role-caption text-[var(--muted-foreground)]"
                      >{plugin.description}</span
                    >
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
      {/if}
    </Card>

    <Card class="p-5">
      <div class="mb-4 flex flex-col gap-0.5">
        <h2 class="role-heading">Сторы</h2>
        <span class="role-caption text-[var(--muted-foreground)]"
          >Источники пакетов плагинов</span
        >
      </div>
      {#if stores.length === 0}
        <div class="p-3 text-center role-body text-[var(--muted-foreground)]">
          Сторы не подключены
        </div>
      {:else}
        <ul class="flex list-none flex-col gap-2 p-0">
          {#each stores as store (store.id)}
            <li
              class="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-2.5"
            >
              <div class="flex min-w-0 flex-col gap-[0.125rem]">
                <span class="role-title">{store.title}</span>
                <span class="role-caption text-[var(--muted-foreground)]">
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
        <p class="mt-3 role-body text-[var(--muted-foreground)]">{unsupported}</p>
      {/if}
      {#if packages.length > 0}
        <ul class="mt-3 flex list-none flex-col gap-2 p-0">
          {#each packages as item (item.name)}
            <li class="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-2.5">
              <span class="role-title">{item.name}</span>
              <Badge variant="outline">{item.version || '—'}</Badge>
              <span class="role-caption text-[var(--muted-foreground)]">{item.description || ''}</span>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:flex-wrap">
        <Input placeholder="Идентификатор" bind:value={storeId} class="sm:max-w-[11.25rem]" />
        <Select
          bind:value={storeKind}
          items={STORE_KIND_OPTIONS}
          ariaLabel="Вид стора"
          class="sm:max-w-[7.5rem]"
        />
        <Input placeholder="Название" bind:value={storeTitle} class="sm:max-w-[11.25rem]" />
        <Input placeholder="Каталог или адрес" bind:value={storeLocation} class="sm:max-w-[15rem]" />
        <Button variant="primary" onclick={addStore}>Добавить стор</Button>
      </div>
    </Card>
  </div>
</ScrollArea>

<ErrorToast message={asyncState.error} />
