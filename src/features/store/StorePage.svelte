<script lang="ts">
  import { t } from '@context/i18n';
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
    ScrollArea,
    createAsyncState,
  } from '@context/ui';
  import { listenEvent, openDialog } from '../../shared/app-bridge';
  import AppInfoPage from '../settings/AppInfoPage.svelte';
  import SettingsPage from '../settings/SettingsPage.svelte';
  import SupportReportCard from '../support/SupportReportCard.svelte';
  import type { NormalizedDeclaration } from '../settings/settings';
  import {
    addStore as addStoreEntry,
    installPluginFromFile,
    listPluginUpdates,
    loadActivationPending,
    loadStoreCatalog,
    removeStore as removeStoreEntry,
    setPluginEnabled,
    uninstallPlugin,
    updatePluginFromStore,
    type PluginEntry,
    type PluginUpdate,
    type Store,
  } from './plugin-store';
  import {
    applyCoreUpdate,
    checkCoreUpdate,
    loadUpdateStatus,
    quitForCoreUpdate,
    saveCheckOnStartup,
    type AvailableCore,
    type UpdateStatus,
  } from '../update/update';

  interface Props {
    /** Передача оболочке признака неприменённых изменений активности. */
    onPendingChange?: (pending: boolean) => void;
    /** Перечень плагинов, загруженный на бутстрапе; `undefined` — загрузить самим. */
    initialPlugins?: PluginEntry[];
    /** Список мест обновления, загруженный на бутстрапе; `undefined` — загрузить самим. */
    initialStores?: Store[];
    /** Признак неприменённых изменений активности, загруженный на бутстрапе. */
    initialPending?: boolean;
    /** Ошибка загрузки каталога на бутстрапе. */
    initialError?: string;
    /** Состояние обновлений, загруженное на бутстрапе. */
    initialUpdate?: UpdateStatus | null;
    /** Доступные обновления плагинов, найденные оболочкой при проверке. */
    initialPluginUpdates?: PluginUpdate[];
    /** Декларации настроек, загруженные на бутстрапе (техническая секция). */
    initialDeclarations?: NormalizedDeclaration[];
    /** Ошибка загрузки деклараций на бутстрапе. */
    initialDeclarationsError?: string;
  }

  let {
    onPendingChange,
    initialPlugins,
    initialStores,
    initialPending,
    initialError,
    initialUpdate = null,
    initialPluginUpdates = [],
    initialDeclarations = [],
    initialDeclarationsError = '',
  }: Props = $props();

  /** Перечень отключаемых плагинов. */
  let plugins: PluginEntry[] = $state(untrack(() => initialPlugins ?? []));

  /** Места, откуда приходят обновления приложения и плагинов. */
  let stores: Store[] = $state(untrack(() => initialStores ?? []));

  /** Состояние обновлений приложения. */
  let updateStatus: UpdateStatus | null = $state(untrack(() => initialUpdate));

  /** Проверять обновления при запуске. */
  let checkOnStartup = $state(untrack(() => initialUpdate?.config.check_on_startup ?? true));

  /** Сообщение о результате проверки или установки. */
  let updateMessage = $state('');

  /** Доступное обновление приложения, найденное ручной проверкой. */
  let availableCore: AvailableCore | null = $state(null);

  /** Обновление приложения установлено и ждёт перезапуска. */
  let coreReady = $state(false);

  /** Доступные обновления плагинов. */
  let pluginUpdates: PluginUpdate[] = $state(untrack(() => initialPluginUpdates));

  /** Синхронизация найденных оболочкой обновлений с уже открытой страницей. */
  $effect(() => {
    if (initialPluginUpdates.length > 0) {
      pluginUpdates = initialPluginUpdates;
    }
  });

  /** Ошибка операции. */
  const asyncState = createAsyncState();

  // Ошибка, переданная с бутстрапа, показывается сразу при монтировании.
  asyncState.error = untrack(() => initialError ?? '');

  /** Адрес или путь, который пользователь добавляет. */
  let addLocation = $state('');

  /** Идёт ли установка плагина из файла. */
  let installing = $state(false);

  /** Сообщение оболочке о наличии неприменённых изменений активности. */
  function publishPending(pending: boolean) {
    onPendingChange?.(pending);
  }

  /** Идёт ли привязка уже сохранённого места обновления к списку. */
  let sourceMigrating = false;

  /** Загрузка плагинов, мест обновления и признака изменений. */
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
    try {
      updateStatus = await loadUpdateStatus();
      checkOnStartup = updateStatus.config.check_on_startup;
      await synchronizeSources();
    } catch {
      // Недоступность настроек обновлений не мешает управлению плагинами.
    }
    try {
      pluginUpdates = await listPluginUpdates();
    } catch {
      pluginUpdates = [];
    }
  }

  /** Приведение списка мест и сохранённого места обновления к одному виду. */
  async function synchronizeSources() {
    if (sourceMigrating || !updateStatus) {
      return;
    }
    const source = updateStatus.config.source;
    if (!source) {
      return;
    }
    if (stores.some((store) => store.kind === source.kind && store.location === source.location)) {
      return;
    }
    sourceMigrating = true;
    try {
      await addStoreEntry({
        id: sourceId(source.location),
        kind: source.kind,
        title: titleOf(source.location),
        location: source.location,
      });
      stores = (await loadStoreCatalog()).stores;
    } catch {
      // Нечитаемое сохранённое место не должно ломать страницу.
    } finally {
      sourceMigrating = false;
    }
  }

  /** Приведение введённого значения к адресу в интернете или папке. */
  function normalizeLocation(value: string): { location: string; kind: 'network' | 'file' } {
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return { location: trimmed, kind: 'network' };
    }
    const looksLikePath =
      /^([a-zA-Z]:[\\/]|~[\\/]|\/|\.{1,2}[\\/])/.test(trimmed) || trimmed.includes('\\');
    if (looksLikePath) {
      return { location: trimmed, kind: 'file' };
    }
    // Обычный ввод по умолчанию считается ссылкой на обновления в интернете.
    return { location: `https://${trimmed}`, kind: 'network' };
  }

  /** Понятное название места обновления. */
  function titleOf(location: string): string {
    if (/^https?:\/\//i.test(location)) {
      try {
        return new URL(location).host;
      } catch {
        return t('app.store.updatesFor');
      }
    }
    const parts = location.replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts[parts.length - 1] || t('app.store.updatesFor');
  }

  /** Уникальный ключ нового места обновления. */
  function sourceId(location: string): string {
    const suffix = Math.random().toString(36).slice(2, 8);
    return `updates-${Date.now().toString(36)}-${suffix}-${location.length}`;
  }

  /** Совпадает ли встроенный адрес обновления с записью списка. */
  function isCurrentAppSource(store: Store): boolean {
    const source = updateStatus?.config.source;
    return Boolean(
      source && source.kind === store.kind && source.location === store.location,
    );
  }

  /** Добавление места обновления. */
  async function addSource(location: string, forcedKind?: 'network' | 'file') {
    const value = location.trim();
    if (!value) {
      return;
    }
    await asyncState.run(async () => {
      const normalized = forcedKind
        ? { location: value, kind: forcedKind }
        : normalizeLocation(value);
      const kind = normalized.kind;
      await addStoreEntry({
        id: sourceId(normalized.location),
        kind,
        title: titleOf(normalized.location),
        location: normalized.location,
      });
      addLocation = '';
      updateMessage = '';
      await load();
    });
  }

  /** Добавление папки с обновлениями. */
  async function chooseFolder() {
    const selected = await openDialog({
      multiple: false,
      directory: true,
    });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (typeof path === 'string' && path) {
      await addSource(path, 'file');
    }
  }

  /** Сохранение признака проверки обновлений при запуске. */
  async function toggleCheckOnStartup(enabled: boolean) {
    checkOnStartup = enabled;
    await asyncState.run(async () => {
      await saveCheckOnStartup(enabled);
    });
  }

  /** Ручная проверка обновлений приложения и плагинов. */
  async function checkUpdates() {
    await asyncState.run(async () => {
      if (!updateStatus?.config.source) {
        updateMessage = t('app.store.addSourceFirst');
        return;
      }
      const result = await checkCoreUpdate();
      availableCore = result.core;
      pluginUpdates = await listPluginUpdates().catch(() => []);
      if (result.core) {
        updateMessage = t('app.store.newVersion', { version: result.core.version });
      } else if (pluginUpdates.length > 0) {
        updateMessage = t('app.store.pluginsAvailable');
      } else if (result.errors.length > 0) {
        updateMessage = t('app.store.checkFailed');
      } else {
        updateMessage = t('app.store.noUpdates');
      }
    });
  }

  /** Установка обновления приложения. */
  async function applyCore() {
    await asyncState.run(async () => {
      const outcome = await applyCoreUpdate();
      coreReady = true;
      updateMessage = t('app.store.installed', { version: outcome.version });
    });
  }

  /** Перезапуск после установки обновления приложения. */
  async function restartCore() {
    await quitForCoreUpdate();
  }

  /** Обновление, доступное для установленного плагина. */
  function updateFor(plugin: PluginEntry): PluginUpdate | undefined {
    return pluginUpdates.find(
      (item) =>
        (item.package.id !== undefined && item.package.id === plugin.id) ||
        item.package.name === plugin.name ||
        item.name === plugin.name,
    );
  }

  /** Установка одного обновления плагина. */
  async function updatePlugin(item: PluginUpdate) {
    await asyncState.run(async () => {
      await updatePluginFromStore(item.store, item.package.name || item.name);
      await load();
    });
  }

  /** Установка всех доступных обновлений плагинов. */
  async function updateAllPlugins() {
    await asyncState.run(async () => {
      for (const item of pluginUpdates) {
        await updatePluginFromStore(item.store, item.package.name || item.name);
      }
      await load();
    });
  }

  /** Переключение активности плагина. */
  async function setEnabled(id: string, enabled: boolean) {
    await asyncState.run(async () => {
      await setPluginEnabled(id, enabled);
      await load();
    });
  }

  /** Установка плагина из выбранного файла. */
  async function installFromFile() {
    installing = true;
    try {
      await asyncState.run(async () => {
        const selected = await openDialog({
          multiple: false,
          directory: false,
          filters: [{ name: t('app.store.pluginFilter'), extensions: ['zip'] }],
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

  /** Удаление места обновления. */
  async function removeStore(id: string) {
    await asyncState.run(async () => {
      await removeStoreEntry(id);
      await load();
    });
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    // Признак изменений сообщаем оболочке синхронно: он рисуется в шапке.
    if (initialPending !== undefined) {
      publishPending(initialPending);
    }
    void synchronizeSources();
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
    <!--
      Порядок раздела: сперва то, что задаёт поведение системы (технические
      настройки), затем обновления и в конце — сведения о приложении. Секция
      технических настроек переиспользует общий рендерер и общее сохранение
      страницы настроек: своего кода у полей нет.
    -->
    <SettingsPage
      {initialDeclarations}
      initialError={initialDeclarationsError}
      only={['app.system']}
      embedded
    />

    <Card class="p-5">
      <div class="mb-4 flex flex-col gap-0.5">
        <h2 class="role-heading">{t('app.store.title')}</h2>
        <span class="role-caption text-[var(--muted-foreground)]"
          >{t('app.store.description')}</span
        >
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="role-title">{t('app.update.application')}</span>
          {#if updateStatus}
            <Badge variant="outline">{updateStatus.current_version}</Badge>
          {/if}
          {#if availableCore}
            <span class="role-caption text-[var(--muted-foreground)]">→</span>
            <Badge variant="outline">{availableCore.version}</Badge>
            {#if !coreReady}
              <Button variant="primary" size="sm" onclick={applyCore}>{t('app.store.update')}</Button>
            {/if}
          {/if}
          {#if coreReady}
            <Button variant="primary" size="sm" onclick={restartCore}>{t('app.update.restart')}</Button>
          {/if}
        </div>
      </div>

      {#if availableCore?.notes}
        <p class="mt-2 role-caption text-[var(--muted-foreground)]">{availableCore.notes}</p>
      {/if}

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={checkOnStartup}
            onchange={(event) => toggleCheckOnStartup(event.currentTarget.checked)}
          />
          <span class="role-body">{t('app.store.checkOnStartup')}</span>
        </label>
        <Button variant="secondary" onclick={checkUpdates}>{t('app.store.check')}</Button>
      </div>

      {#if updateMessage}
        <p class="mt-2 role-body" data-testid="update-message">{updateMessage}</p>
      {/if}

      <div class="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
        <span class="role-title">{t('app.store.sources')}</span>
        {#if stores.length > 0}
          <ul class="flex list-none flex-col gap-2 p-0">
            {#each stores as store (store.id)}
              <li
                class="flex items-center justify-between gap-3 rounded-[var(--radius)] bg-[var(--surface-inset)] p-2.5"
              >
                <div class="flex min-w-0 flex-col gap-[0.125rem]">
                  <span class="role-body break-all">{store.location || '—'}</span>
                </div>
                {#if !isCurrentAppSource(store)}
                  <IconButton
                    action="delete"
                    title={t('app.store.removeSource')}
                    ariaLabel={t('app.store.removeSource')}
                    onclick={() => removeStore(store.id)}
                  />
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Input
            bind:value={addLocation}
            placeholder="https://…"
            class="min-w-0 flex-1"
            onkeydown={(event) => {
              if (event.key === 'Enter') {
                void addSource(addLocation);
              }
            }}
          />
          <Button variant="primary" onclick={() => addSource(addLocation)}>{t('app.store.add')}</Button>
          <Button variant="secondary" onclick={chooseFolder}>{t('app.store.chooseFolder')}</Button>
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="role-title">{t('app.store.installedPlugins')}</span>
          <div class="flex flex-wrap gap-2">
            {#if pluginUpdates.length > 1}
              <Button variant="secondary" size="sm" onclick={updateAllPlugins}>
                {t('app.store.updateAll')}
              </Button>
            {/if}
            <Button variant="secondary" size="sm" disabled={installing} onclick={installFromFile}>
              <Icon name="plus" />
              {t('app.store.installFromFile')}
            </Button>
          </div>
        </div>
        {#if plugins.length === 0}
          <div class="p-4 text-center role-body text-[var(--muted-foreground)]">{t('app.store.noPlugins')}</div>
        {:else}
          <ul class="flex list-none flex-col gap-2 p-0" data-testid="store-plugins">
            {#each plugins as plugin (plugin.id)}
              {@const update = updateFor(plugin)}
              <li
                class="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] bg-[var(--surface-inset)] p-2.5"
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
                <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {#if update}
                    <Badge variant="outline">
                      {plugin.version || '—'} → {update.package.version || '—'}
                    </Badge>
                    <Button variant="primary" size="sm" onclick={() => updatePlugin(update)}>
                      {t('app.store.update')}
                    </Button>
                  {:else if plugin.version}
                    <Badge variant="outline">{plugin.version}</Badge>
                  {/if}
                  {#if plugin.removable}
                    <IconButton
                      action="delete"
                      title={t('app.store.deletePlugin')}
                      ariaLabel={t('app.store.deletePlugin')}
                      onclick={() => uninstall(plugin.id)}
                    />
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </Card>

    <SupportReportCard />

    <div data-testid="app-info-page">
      <AppInfoPage />
    </div>
  </div>
</ScrollArea>

<ErrorToast message={asyncState.error} />
