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
  import SourceEditor from './SourceEditor.svelte';
  import {
    addStore as addStoreEntry,
    installPluginFromFile,
    listPluginUpdates,
    loadActivationPending,
    loadStoreCatalog,
    removeStore as removeStoreEntry,
    resetPluginSource,
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
    clearUpdateSource,
    loadUpdateStatus,
    quitForCoreUpdate,
    saveCheckOnStartup,
    saveUpdateSource,
    type AvailableCore,
    type UpdateStatus,
  } from '../update/update';

  interface Props {
    /** Передача оболочке признака неприменённых изменений активности. */
    onPendingChange?: (pending: boolean) => void;
    /** Перечень отключённых плагинов, загруженный на бутстрапе. */
    initialPlugins?: PluginEntry[];
    /** Источники обновлений плагинов, загруженные на бутстрапе. */
    initialStores?: Store[];
    /** Признак неприменённых изменений активности, загруженный на бутстрапе. */
    initialPending?: boolean;
    /** Ошибка загрузки каталога на бутстрапе. */
    initialError?: string;
    /** Состояние обновлений приложения, загруженное на бутстрапе. */
    initialUpdate?: UpdateStatus | null;
    /** Доступные обновления плагинов, найденные оболочкой при проверке. */
    initialPluginUpdates?: PluginUpdate[];
  }

  let {
    onPendingChange,
    initialPlugins,
    initialStores,
    initialPending,
    initialError,
    initialUpdate = null,
    initialPluginUpdates = [],
  }: Props = $props();

  /** Установленные плагины. */
  let plugins: PluginEntry[] = $state(untrack(() => initialPlugins ?? []));

  /** Источники обновлений плагинов. */
  let stores: Store[] = $state(untrack(() => initialStores ?? []));

  /** Состояние обновлений приложения. */
  let updateStatus: UpdateStatus | null = $state(untrack(() => initialUpdate));

  /** Проверять обновления при запуске. */
  let checkOnStartup = $state(untrack(() => initialUpdate?.config.check_on_startup ?? true));

  /** Доступное обновление приложения. */
  let availableCore: AvailableCore | null = $state(null);

  /** Откуда пришло обновление приложения. */
  let coreSource = $state('');

  /** Обновление приложения установлено и ждёт перезапуска. */
  let coreReady = $state(false);

  /** Доступные обновления плагинов. */
  let pluginUpdates: PluginUpdate[] = $state(untrack(() => initialPluginUpdates));

  /** Сообщение о проверке обновлений приложения. */
  let appMessage = $state('');

  /** Сообщение о проверке обновлений плагинов. */
  let pluginsMessage = $state('');

  /** Причины, по которым источник обновлений приложения не прочитан. */
  let appErrors: string[] = $state([]);

  /** Причины, по которым источники плагинов не прочитаны. */
  let pluginErrors: string[] = $state([]);

  /** Идёт ли установка плагина из файла. */
  let installing = $state(false);

  /** Ошибка операции. */
  const asyncState = createAsyncState();

  // Ошибка, переданная с бутстрапа, показывается сразу при монтировании.
  asyncState.error = untrack(() => initialError ?? '');

  /** Сообщение оболочке о наличии неприменённых изменений активности. */
  function publishPending(pending: boolean) {
    onPendingChange?.(pending);
  }

  /** Подпись источника по его расположению. */
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

  // ---- Обновления приложения ----

  /** Источник обновлений приложения. */
  const appSource = $derived(coreSource || updateStatus?.config.source?.location || '');

  /** Сохранение источника обновлений приложения. */
  async function saveAppSource(location: string, kind: 'file' | 'network') {
    const value = location.trim();
    if (!value) {
      return;
    }
    await asyncState.run(async () => {
      // Вид источника приходит из формы: правка существующего адреса не меняет
      // его вид, иначе файловый путь превращался бы в сетевой.
      await saveUpdateSource({ kind, location: value });
      updateStatus = await loadUpdateStatus();
      // Прежний результат относился к старому источнику: его надо проверить
      // заново, иначе останется версия, которой в новом месте нет.
      availableCore = null;
      coreSource = '';
      appMessage = '';
      appErrors = [];
    });
  }

  /** Выбор папки как источника приложения. */
  async function chooseAppSourceFolder() {
    const selected = await openDialog({ multiple: false, directory: true });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (typeof path === 'string' && path) {
      await saveAppSource(path, 'file');
    }
  }

  /** Возврат встроенного источника обновлений приложения. */
  async function resetAppSource() {
    await asyncState.run(async () => {
      await clearUpdateSource();
      updateStatus = await loadUpdateStatus();
      // Прежний результат относился к старому адресу: его надо проверить заново.
      availableCore = null;
      coreSource = '';
      appMessage = '';
      appErrors = [];
    });
  }

  /** Проверка обновлений приложения. */
  async function checkAppUpdates() {
    await asyncState.run(async () => {
      const result = await checkCoreUpdate();
      availableCore = result.core;
      coreSource = result.source?.location ?? '';
      appErrors = result.errors;
      appMessage = result.core
        ? t('app.store.newVersion', { version: result.core.version })
        : appErrors.length > 0
          ? ''
          : t('app.store.noUpdates');
    });
  }

  /** Установка обновления приложения. */
  async function applyCore() {
    await asyncState.run(async () => {
      const outcome = await applyCoreUpdate();
      coreReady = true;
      appMessage = t('app.store.installed', { version: outcome.version });
    });
  }

  /** Перезапуск после установки обновления приложения. */
  async function restartCore() {
    await quitForCoreUpdate();
  }

  // ---- Обновления плагинов ----

  /**
   * Источник обновлений плагинов по умолчанию.
   *
   * Он один, как и у приложения: именно он подставляется, пока пользователь не
   * добавил свои места. Адрес приложения сюда не попадает — у плагинов своё
   * место, и одинаковый путь в двух разделах читался как две разные ссылки.
   */
  const defaultPluginSource = $derived(
    stores.find((store) => store.location !== appSource) ?? null,
  );

  /** Дополнительные места плагинов, добавленные пользователем. */
  const extraPluginSources = $derived(
    stores.filter((store) => store.location !== appSource && store !== defaultPluginSource),
  );

  /** Уникальный ключ нового места плагинов. */
  function pluginSourceId(location: string): string {
    const suffix = Math.random().toString(36).slice(2, 8);
    return `plugins-${Date.now().toString(36)}-${suffix}-${location.length}`;
  }

  /** Сохранение источника плагинов по умолчанию. */
  async function saveDefaultPluginSource(location: string, kind: 'file' | 'network') {
    const value = location.trim();
    if (!value) {
      return;
    }
    await asyncState.run(async () => {
      // Вид источника не пересчитывается: правка адреса не должна менять его.
      if (defaultPluginSource) {
        await removeStoreEntry(defaultPluginSource.id);
      }
      await addStoreEntry({
        id: pluginSourceId(value),
        kind,
        title: titleOf(value),
        location: value,
      });
      pluginUpdates = [];
      pluginsMessage = '';
      pluginErrors = [];
      stores = (await loadStoreCatalog()).stores;
    });
  }

  /** Выбор папки как источника плагинов по умолчанию. */
  async function chooseDefaultPluginFolder() {
    const selected = await openDialog({ multiple: false, directory: true });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (typeof path === 'string' && path) {
      await saveDefaultPluginSource(path, 'file');
    }
  }

  /** Добавление дополнительного места плагинов. */
  async function addPluginSource(location: string, kind: 'file' | 'network') {
    const value = location.trim();
    if (!value) {
      return;
    }
    await asyncState.run(async () => {
      await addStoreEntry({
        id: pluginSourceId(value),
        kind,
        title: titleOf(value),
        location: value,
      });
      pluginErrors = [];
      stores = (await loadStoreCatalog()).stores;
    });
  }

  /** Возврат встроенного источника обновлений плагинов. */
  async function resetDefaultPluginSource() {
    await asyncState.run(async () => {
      await resetPluginSource();
      pluginUpdates = [];
      pluginsMessage = '';
      pluginErrors = [];
      stores = (await loadStoreCatalog()).stores;
    });
  }

  /** Удаление дополнительного места плагинов. */
  async function removePluginSource(id: string) {
    await asyncState.run(async () => {
      await removeStoreEntry(id);
      stores = (await loadStoreCatalog()).stores;
    });
  }

  /** Проверка обновлений плагинов. */
  async function checkPluginUpdates() {
    await asyncState.run(async () => {
      const result = await listPluginUpdates();
      pluginUpdates = result.updates;
      pluginErrors = result.errors;
      pluginsMessage =
        result.updates.length > 0
          ? t('app.store.pluginsAvailable')
          : result.errors.length > 0
            ? ''
            : t('app.store.noUpdates');
    });
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

  // ---- Установленные плагины ----

  /** Обновление, доступное для установленного плагина. */
  function updateFor(plugin: PluginEntry): PluginUpdate | undefined {
    return pluginUpdates.find(
      (item) =>
        (item.package.id !== undefined && item.package.id === plugin.id) ||
        item.package.name === plugin.name ||
        item.name === plugin.name,
    );
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

  // ---- Общее ----

  /** Сохранение признака проверки обновлений при запуске. */
  async function toggleCheckOnStartup(enabled: boolean) {
    checkOnStartup = enabled;
    await asyncState.run(async () => {
      await saveCheckOnStartup(enabled);
    });
  }

  /** Перечитывание каталога плагинов и источников. */
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
      const last = updateStatus.last_check;
      if (last?.core) {
        availableCore = last.core;
        coreSource = last.source?.location ?? '';
      }
    } catch {
      // Недоступность настроек обновлений не мешает управлению плагинами.
    }
    try {
      const result = await listPluginUpdates();
      pluginUpdates = result.updates;
      pluginErrors = result.errors;
    } catch {
      pluginUpdates = [];
    }
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
    <!--
      Приложение и плагины — два самостоятельных раздела. У каждого свои
      обновления, свои источники и своя проверка: приложение обновляется
      целиком из одного места, плагины — по одному из своих мест.
    -->
    <Card class="p-5">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-baseline gap-2">
          <h2 class="role-heading shrink-0">{t('app.update.application')}</h2>
          <!--
            Все уведомления раздела стоят рядом с заголовком: отдельными
            строками они сдвигали содержимое вниз, и кнопки уезжали из-под
            пальца. Полный текст причин — в подсказке.
          -->
          <span
            class="role-caption truncate text-[var(--muted-foreground)]"
            title={[...(appMessage ? [appMessage] : []), ...appErrors].join('\n')}
            data-testid="app-update-message"
          >
            {appMessage || (appErrors.length > 0 ? appErrors[0] : '')}
          </span>
        </div>
        <div class="flex flex-none items-center gap-3">
          <!-- Сначала настройка, затем действие: кнопка стоит справа. -->
          <label class="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={checkOnStartup}
              onchange={(event) => toggleCheckOnStartup(event.currentTarget.checked)}
            />
            <span class="role-body">{t('app.store.checkOnStartup')}</span>
          </label>
          <Button variant="primary" size="sm" onclick={checkAppUpdates}>
            {t('app.store.check')}
          </Button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        {#if updateStatus}
          <Badge variant="outline">{updateStatus.current_version}</Badge>
        {/if}
        {#if availableCore}
          <span class="role-caption text-[var(--muted-foreground)]">→</span>
          <Badge variant="outline">{availableCore.version}</Badge>
          {#if !coreReady}
            <Button variant="primary" size="sm" onclick={applyCore}>
              {t('app.store.update')}
            </Button>
          {/if}
        {/if}
        {#if coreReady}
          <Button variant="primary" size="sm" onclick={restartCore}>
            {t('app.update.restart')}
          </Button>
        {/if}
      </div>

      {#if availableCore?.notes}
        <!-- Заметки о выпуске — тоже уведомление: место у версии, а не отдельной
             строкой, которая сдвигает источник и установленное ниже. -->
        <p class="mt-1 role-caption text-[var(--muted-foreground)]">{availableCore.notes}</p>
      {/if}

      <div class="mt-4 border-t border-[var(--border)] pt-3">
        <SourceEditor
          label={t('app.store.source')}
          ariaLabel={t('app.store.appSource')}
          testId="store-app-source"
          value={appSource}
          kind={updateStatus?.config.source?.kind ?? 'file'}
          onSave={(location, kind) => saveAppSource(location, kind)}
          onChooseFolder={chooseAppSourceFolder}
          onReset={() => resetAppSource()}
        />
      </div>
    </Card>

    <!--
      Плагины — один раздел: сначала источники, из которых приходят обновления,
      затем сами плагины. Обновление видно у своего плагина, общий итог проверки
      стоит у заголовка.
    -->
    <Card class="p-5">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex min-w-0 items-baseline gap-2">
          <h2 class="role-heading shrink-0">{t('app.update.plugins')}</h2>
          <!--
            Общий итог проверки — у заголовка: отдельной строкой он сдвигал
            содержимое вниз. Полный текст причин — в подсказке.
          -->
          <span
            class="role-caption truncate text-[var(--muted-foreground)]"
            title={[...(pluginsMessage ? [pluginsMessage] : []), ...pluginErrors].join('\n')}
            data-testid="plugin-update-message"
          >
            {pluginsMessage || (pluginErrors.length > 0 ? pluginErrors[0] : '')}
          </span>
        </div>
        <div class="flex flex-none flex-wrap items-center gap-2">
          {#if pluginUpdates.length > 1}
            <Button variant="secondary" size="sm" onclick={updateAllPlugins}>
              {t('app.store.updateAll')}
            </Button>
          {/if}
          <Button variant="secondary" size="sm" disabled={installing} onclick={installFromFile}>
            <Icon name="plus" />
            {t('app.store.installFromFile')}
          </Button>
          <!-- Кнопка проверки крайняя справа — так же, как в разделе приложения. -->
          <Button variant="primary" size="sm" onclick={checkPluginUpdates}>
            {t('app.store.check')}
          </Button>
        </div>
      </div>

      <!-- Источники стоят выше списка: из них приходят обновления плагинов. -->
      <div class="flex flex-col gap-3 border-b border-[var(--border)] pb-3">
        <SourceEditor
          label={t('app.store.source')}
          ariaLabel={t('app.store.pluginSourceDefault')}
          testId="store-plugin-source"
          value={defaultPluginSource?.location ?? ''}
          addLabel={t('app.store.pluginSourceAdd')}
          onAdd={(location, kind) => addPluginSource(location, kind)}
          onSave={(location, kind) => saveDefaultPluginSource(location, kind)}
          onChooseFolder={chooseDefaultPluginFolder}
          onReset={() => resetDefaultPluginSource()}
        />

        {#if extraPluginSources.length > 0}
          <div class="flex flex-col gap-2">
            <span class="role-caption text-[var(--muted-foreground)]"
              >{t('app.store.pluginSourcesExtra')}</span
            >
            <ul class="flex list-none flex-col p-0" data-testid="store-plugin-sources">
              {#each extraPluginSources as store (store.id)}
                <li
                  class="flex items-center justify-between gap-3 py-2 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-[var(--divider)]"
                >
                  <code class="break-all role-mono text-[var(--muted-foreground)]">{store.location || '—'}</code>
                  <IconButton
                    action="delete"
                    title={t('app.store.removeSource')}
                    ariaLabel={t('app.store.removeSource')}
                    onclick={() => removePluginSource(store.id)}
                  />
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      {#if plugins.length === 0}
        <div class="p-4 text-center role-body text-[var(--muted-foreground)]">{t('app.store.noPlugins')}</div>
      {:else}
        <ul class="flex list-none flex-col p-0" data-testid="store-plugins">
          {#each plugins as plugin (plugin.id)}
            {@const update = updateFor(plugin)}
            <li
              class="flex flex-wrap items-center justify-between gap-3 py-2.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-[var(--divider)]"
            >
              <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={plugin.enabled}
                  onchange={(event) => setEnabled(plugin.id, event.currentTarget.checked)}
                />
                <span class="flex min-w-0 items-baseline gap-2">
                  <span class="role-title">{plugin.name}</span>
                  <!--
                    Уведомление о новой версии — у самого плагина: оно относится
                    к нему, а не ко всему разделу.
                  -->
                  {#if update}
                    <span class="role-caption text-[var(--muted-foreground)]">
                      {t('app.store.updateAvailable', {
                        version: update.package.version || '—',
                      })}
                    </span>
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
    </Card>

    <div data-testid="app-info-page">
      <AppInfoPage />
    </div>
  </div>
</ScrollArea>

<ErrorToast message={asyncState.error} />
