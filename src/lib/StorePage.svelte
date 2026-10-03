<script lang="ts">
  import { onMount } from 'svelte';
  import { Badge, Button, Card, Checkbox, Input, Select } from '@texture/ui';
  import { invokeCommand, listenEvent, openDialog } from './app-bridge';

  /** Плагин в перечне стора с признаком активности. */
  interface PluginEntry {
    /** Стабильный идентификатор плагина. */
    id: string;
    /** Человекочитаемое имя плагина. */
    name: string;
    /** Категория плагина. */
    kind: string;
    /** Описание плагина. */
    description: string;
    /** Включён ли плагин. */
    enabled: boolean;
    /** Можно ли удалить плагин. */
    removable: boolean;
    /** Является ли плагин образцом для разработчика. */
    sample?: boolean;
  }

  /** Подключённый стор. */
  interface Store {
    /** Уникальный идентификатор. */
    id: string;
    /** Вид провайдера. */
    kind: string;
    /** Человекочитаемое название. */
    title: string;
    /** Расположение: каталог или адрес. */
    location: string;
  }

  /** Пакет в индексе стора. */
  interface StorePackage {
    /** Имя пакета. */
    name: string;
    /** Версия пакета. */
    version?: string;
    /** Категория плагина. */
    kind?: string;
    /** Описание пакета. */
    description?: string;
    /** Путь к zip-пакету. */
    location: string;
  }

  interface Props {
    /** Передача оболочке признака неприменённых изменений активности. */
    onPendingChange?: (pending: boolean) => void;
  }

  let { onPendingChange }: Props = $props();

  /** Capability базового плагина стора. */
  const STORE_CAPABILITY = 'plugin-store@1';

  /** Перечень отключаемых плагинов. */
  let plugins: PluginEntry[] = $state([]);

  /** Реестр подключённых сторов. */
  let stores: Store[] = $state([]);

  /** Пакеты выбранного стора. */
  let packages: StorePackage[] = $state([]);

  /** Сообщение о неподдержке сетевого стора. */
  let unsupported: string = $state('');

  /** Ошибка операции стора. */
  let errorMessage: string = $state('');

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

  /** Вызов opaque-операции базового плагина стора. */
  async function operation<T>(action: string, payload: unknown = {}): Promise<T> {
    return (await invokeCommand('invoke_base_plugin_operation', {
      capability: STORE_CAPABILITY,
      operation: action,
      payload,
    })) as T;
  }

  /** Сообщение оболочке о наличии неприменённых изменений активности. */
  async function publishPending() {
    try {
      const { pending } = (await invokeCommand('plugin_activation_pending', {})) as {
        pending: boolean;
      };
      onPendingChange?.(pending);
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
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: 'Пакет плагина', extensions: ['zip'] }],
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (typeof path !== 'string' || !path) {
        return;
      }
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

  /** Добавление стора из формы. */
  async function addStore() {
    if (!storeId.trim()) {
      return;
    }
    try {
      await operation('stores_add', {
        store: {
          id: storeId.trim(),
          kind: storeKind,
          title: storeTitle.trim() || storeId.trim(),
          location: storeLocation.trim(),
        },
      });
      storeId = '';
      storeTitle = '';
      storeLocation = '';
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
      unlisten = await listenEvent('plugin-store:changed', () => {
        void load();
      });
      await load();
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<div class="flex flex-col gap-[var(--space-4)] p-[var(--space-4)]">
  <Card>
    <div class="mb-[var(--space-3)] flex items-start justify-between gap-[var(--space-3)]">
      <h2 class="text-base font-semibold">Плагины</h2>
      <Button variant="secondary" onclick={installFromFile}>Установить из файла</Button>
    </div>
    {#if plugins.length === 0}
      <div class="p-[var(--space-4)] text-center text-[var(--color-text-muted)]">
        Нет плагинов
      </div>
    {:else}
      <ul class="flex list-none flex-col gap-[var(--space-2)] p-0">
        {#each regularPlugins as plugin (plugin.id)}
          <li
            class="flex items-center justify-between gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--space-2)]"
          >
            <label class="flex min-w-0 items-center gap-[var(--space-2)]">
              <Checkbox
                checked={plugin.enabled}
                onchange={(event) => setEnabled(plugin.id, event.currentTarget.checked)}
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
              <Button variant="danger" size="sm" onclick={() => uninstall(plugin.id)}>
                Удалить
              </Button>
            {/if}
          </li>
        {/each}
      </ul>

      {#if samplePlugins.length > 0}
        <details class="mt-[var(--space-3)] border-t border-[var(--color-border)] pt-[var(--space-3)]">
          <summary class="cursor-pointer text-xs text-[var(--color-text-muted)]">
            Образцы для разработчика ({samplePlugins.length})
          </summary>
          <ul class="mt-[var(--space-2)] flex list-none flex-col gap-[var(--space-2)] p-0">
            {#each samplePlugins as plugin (plugin.id)}
              <li
                class="flex items-center justify-between gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--space-2)] opacity-70"
              >
                <label class="flex min-w-0 items-center gap-[var(--space-2)]">
                  <Checkbox
                    checked={plugin.enabled}
                    onchange={(event) => setEnabled(plugin.id, event.currentTarget.checked)}
                  />
                  <span class="flex min-w-0 flex-col gap-[2px]">
                    <span class="flex flex-wrap items-baseline gap-[var(--space-2)]">
                      <span class="text-sm font-bold">{plugin.name}</span>
                      <Badge>образец</Badge>
                    </span>
                    {#if plugin.description}
                      <span class="text-xs text-[var(--color-text-muted)]">{plugin.description}</span>
                    {/if}
                  </span>
                </label>
                {#if plugin.removable}
                  <Button variant="danger" size="sm" onclick={() => uninstall(plugin.id)}>
                    Удалить
                  </Button>
                {/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
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
              <Button variant="secondary" size="sm" onclick={() => showAvailable(store.id)}>
                Пакеты
              </Button>
              <Button variant="danger" size="sm" onclick={() => removeStore(store.id)}>
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
      <Button variant="primary" onclick={addStore}>Добавить стор</Button>
    </div>
  </Card>
</div>

{#if errorMessage}
  <div
    class="fixed right-[8px] bottom-[8px] left-[8px] z-10 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-[var(--space-2)] text-xs text-[var(--color-danger)]"
    role="alert"
  >
    {errorMessage}
  </div>
{/if}
