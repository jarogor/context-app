<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Badge,
    Button,
    EntityList,
    Icon,
    Input,
    PageShell,
    Progress,
    Select,
    Spinner,
    type MenuAction,
    type MetaItem,
  } from '@context/ui';
  import { invokeCommand, listenEvent, openDialog } from '../../shared/app-bridge';
  import { t } from '@context/i18n';
  import { formatDateTime } from '../../shared/format';
  import { currentLocale } from '@context/i18n';
  import { lastSegment } from '../../shared/path';
  import { activeLibrary } from '../../shared/base-plugin';
  import appConfig from './app-config.json';

  interface Props {
    /** Вызывается после успешного открытия библиотеки. */
    onOpened: () => void;
  }

  let { onOpened }: Props = $props();

  /** Запись истории открытых библиотек. */
  interface HistoryEntry {
    /** Путь библиотеки. */
    path: string;
    /** Идентификатор провайдера. */
    provider: string;
    /** Человекочитаемое имя провайдера. */
    providerName: string;
    /** Время открытия записи (Unix, мс). */
    addedAtMillis: number;
    /** Доступна ли библиотека на диске. */
    available: boolean;
  }

  /** Нормализация записи истории из ответа команды (snake_case → camelCase). */
  function normalizeHistoryEntry(value: unknown): HistoryEntry {
    const record = (value ?? {}) as Record<string, unknown>;
    return {
      path: String(record.path ?? ''),
      provider: String(record.provider ?? ''),
      providerName: String(record.provider_name ?? ''),
      addedAtMillis: Number(record.added_at_millis ?? 0),
      available: Boolean(record.available),
    };
  }

  let entries: HistoryEntry[] = $state([]);
  let loading: boolean = $state(false);
  let openingPath: string | null = $state(null);
  let activePath: string | null = $state(null);
  let error: string | null = $state(null);
  /** Прогресс построения индекса открываемой библиотеки (в процентах). */
  let progress: { done: number; total: number; percent: number } | null = $state(null);

  /** Строка поиска по имени библиотеки. */
  let query = $state('');

  /** Режим показа библиотек: строки или плитка. */
  let viewMode = $state<'list' | 'grid'>('list');

  /** Запоминание режима показа в браузере: он переживает перезапуск. */
  function chooseViewMode(mode: 'list' | 'grid') {
    viewMode = mode;
    try {
      localStorage.setItem('libraries-view-mode', mode);
    } catch {
      /* Хранилище недоступно — режим остаётся в состоянии страницы. */
    }
  }

  /** Порядок списка: по имени или по времени последнего открытия. */
  let sortField = $state<'name' | 'opened'>('opened');

  /** Направление порядка: свежие и А–Я считаются по-разному. */
  let sortDirection = $state<'asc' | 'desc'>('desc');

  /** Варианты порядка списка библиотек. */
  const sortOptions = $derived([
    { value: 'opened', label: t('app.library.libraries.sort.opened') },
    { value: 'name', label: t('app.library.libraries.sort.name') },
  ]);

  /** Смена поля порядка: направление берётся удобное для поля. */
  function chooseSort(value: string) {
    sortField = value === 'name' ? 'name' : 'opened';
    sortDirection = sortField === 'name' ? 'asc' : 'desc';
  }

  /**
   * Выбранная библиотека — та, что показана панелью слева.
   *
   * Выбор и открытие разделены, как в реестре наборов заметок: клик по строке
   * загружает библиотеку и показывает её сведения, но книги не открывает.
   * Книги открываются явным действием карточки — тогда пользователь точно
   * понимает, куда перешёл.
   */
  let selectedPath = $state<string | null>(null);

  /** Запись, показанная панелью: выбранная, а без выбора — открытая. */
  const selectedEntry = $derived(
    entries.find((entry) => entry.path === (selectedPath ?? activePath)) ?? null,
  );

  /** Идёт ли открытие библиотеки. */
  const opening = $derived(openingPath !== null);

  /** Идёт ли открытие пути, которого ещё нет в истории. */
  const openingNew = $derived(
    openingPath !== null && !entries.some((entry) => entry.path === openingPath),
  );

  /** Записи списка, отфильтрованные поиском и упорядоченные выбранным полем. */
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const found = needle
      ? entries.filter((entry) => libraryName(entry.path).toLowerCase().includes(needle))
      : [...entries];
    const factor = sortDirection === 'asc' ? 1 : -1;
    return found.sort((left, right) => {
      if (sortField === 'name') {
        return factor * libraryName(left.path).localeCompare(libraryName(right.path), currentLocale());
      }
      // По времени открытия: у записей без времени порядок задаёт имя.
      const delta = (left.addedAtMillis ?? 0) - (right.addedAtMillis ?? 0);
      return delta !== 0
        ? factor * delta
        : libraryName(left.path).localeCompare(libraryName(right.path), currentLocale());
    });
  });

  /** Имя библиотеки по последнему сегменту пути. */
  function libraryName(path: string): string {
    return lastSegment(path);
  }

  /**
   * Имя провайдера для показа.
   *
   * Идентификаторы плагинов — служебные (`books-source`, `books-source-calibre`);
   * пользователь видит источник по короткому имени: `context` для общего
   * источника книг и `calibre` для библиотеки Calibre. Неизвестный провайдер
   * показывается как есть — выдумывать ему имя нельзя.
   */
  function providerLabel(provider: string): string {
    const id = provider.trim().toLowerCase();
    if (id === 'books-source') {
      return 'context';
    }
    if (id === 'books-source-calibre') {
      return 'calibre';
    }
    return provider;
  }

  /** Метаинформация записи истории: время открытия и путь. */
  function metaItems(entry: HistoryEntry): MetaItem[] {
    const items: MetaItem[] = [];
    const opened = formatDateTime(entry.addedAtMillis);
    if (opened) {
      items.push({
        icon: 'clock',
        value: opened,
        title: t('app.library.libraries.opened', { date: opened }),
      });
    }
    if (entry.path) {
      items.push({
        icon: 'folder',
        value: entry.path,
        title: entry.path,
        testId: 'library-path',
        // Отсутствующая библиотека помечается у самого пути: подпись рядом с
        // путём объясняет, чего именно нет.
        labelAfter: entry.available ? undefined : t('app.library.libraries.missing'),
        tone: entry.available ? undefined : 'danger',
      });
    }
    return items;
  }

  /** Пункты меню действий записи истории. */
  /**
   * Пункты меню записи истории.
   *
   * «Открыть папку» показывает директорию библиотеки в файловом менеджере:
   * открыть саму библиотеку можно кликом по строке, поэтому пункт делает то,
   * чего клик не умеет.
   */
  function entryActions(entry: HistoryEntry): MenuAction[] {
    // У отсутствующей библиотеки открывать нечего: остаётся только убрать запись.
    if (!entry.available) {
      return [{ id: 'forget', label: t('app.library.libraries.forget'), destructive: true }];
    }
    return [
      { id: 'open-folder', label: t('app.library.libraries.openFolder') },
      { id: 'forget', label: t('app.library.libraries.forget'), destructive: true },
    ];
  }

  /** Загрузка истории открытых библиотек. */
  async function loadHistory() {
    loading = true;
    try {
      const response = (await invokeCommand('library_history_list', {})) as {
        entries?: unknown[];
      };
      entries = (response.entries ?? []).map(normalizeHistoryEntry);
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  /** Загрузка сведений об активной библиотеке. */
  async function loadActive() {
    try {
      const response = await activeLibrary();
      activePath = response?.path ?? null;
    } catch {
      // Отсутствие активной библиотеки не является ошибкой страницы.
    }
  }

  /**
   * Загрузка библиотеки: каталог строится, сведения показываются в панели.
   *
   * Переход к книгам не выполняется: библиотека только выбирается. Так выбор
   * библиотеки в списке не уносит пользователя из раздела, а карточка слева
   * успевает показать, что именно выбрано.
   */
  async function loadLibrary(path: string) {
    if (opening) {
      return;
    }
    selectedPath = path;
    openingPath = path;
    error = null;
    progress = null;
    try {
      // Уже открытая библиотека не переоткрывается: ядро вернёт её без опроса
      // source-плагинов и переиндексации (см. `select_source_library`).
      await invokeCommand('select_source_library', {
        path,
        storageRoot: appConfig.state_dir,
      });
      activePath = path;
    } catch (e) {
      error = String(e);
    } finally {
      openingPath = null;
      progress = null;
      void loadHistory();
    }
  }

  /** Переход к книгам выбранной библиотеки: её каталог уже загружен выбором. */
  function openLibraryBooks() {
    onOpened();
  }

  /** Выбор новой папки библиотеки. */
  async function pickLibrary() {
    if (opening) {
      return;
    }
    error = null;
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        await loadLibrary(selected);
      }
    } catch (e) {
      error = String(e);
    }
  }

  /** Удаление записи из истории. */
  async function forget(path: string) {
    try {
      await invokeCommand('library_history_forget', { path });
      await loadHistory();
    } catch (e) {
      error = String(e);
    }
  }

  /** Выбор действия записи истории из меню. */
  function runEntryAction(entry: HistoryEntry, action: string) {
    if (action === 'open-folder') {
      void openFolder(entry.path);
    }
    if (action === 'forget') {
      void forget(entry.path);
    }
  }

  /** Открытие директории библиотеки системным файловым менеджером. */
  async function openFolder(path: string) {
    try {
      await invokeCommand('open_folder', { path });
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => {
    // Режим показа переживает перезапуск: он хранится в браузере, как у книг.
    try {
      const stored = localStorage.getItem('libraries-view-mode');
      if (stored === 'list' || stored === 'grid') {
        viewMode = stored;
      }
    } catch {
      /* Хранилище недоступно — режим по умолчанию остаётся. */
    }
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('library-index-progress', (value) => {
        const payload = value as { done?: number; total?: number; percent?: number };
        if (openingPath !== null && typeof payload?.percent === 'number') {
          progress = {
            done: payload.done ?? 0,
            total: payload.total ?? 0,
            percent: payload.percent,
          };
        }
      });
    })();
    void loadHistory();
    void loadActive();
    return () => unlisten?.();
  });
</script>

<PageShell
  testId="libraries-page"
  width="full"
  loading={loading && entries.length === 0}
  loadingText={t('app.loading')}
  empty={entries.length === 0}
  emptyIcon="library"
  emptyTitle={t('app.library.libraries.empty.title')}
  emptyText={t('app.library.libraries.empty.description')}
>
  {#snippet emptyAction()}
    <Button variant="primary" disabled={opening} onclick={pickLibrary}>
      {#if openingNew}
        <Spinner class="h-4 w-4" />
      {/if}
      <Icon name="folder" />
      {t('app.library.libraries.add')}
    </Button>
  {/snippet}

  {#snippet controls()}
    <!--
      Полоса управления как в библиотеке книг: действие добавления слева, справа
      сортировка и переключатель вида. На узком окне они переносятся друг под
      друга, поэтому кнопка не съезжает от длинной подписи сортировки.
    -->
    <div class="flex w-full min-w-0 flex-wrap items-center gap-2">
      <Button
        variant="primary"
        disabled={opening}
        ariaLabel={t('app.library.libraries.add')}
        onclick={pickLibrary}
      >
        {#if openingNew}
          <Spinner class="h-4 w-4" />
        {/if}
        <Icon name="folder" />
        {t('app.library.libraries.addShort')}
      </Button>
      <Input
        bind:value={query}
        placeholder={t('app.search.library.placeholder')}
        ariaLabel={t('app.search.library.placeholder')}
        icon="search"
        clearable
        class="min-w-0 flex-1 sm:max-w-[22rem]"
      />
      <!-- Счётчик рядом с поиском — тот же, что в списке рабочих мест. -->
      <span
        class="shrink-0 role-caption whitespace-nowrap text-[var(--muted-foreground)]"
        data-testid="libraries-filter-counter"
      >
        {t('app.search.filter', { shown: filtered.length, total: entries.length })}
      </span>
      <div class="ml-auto flex items-center gap-2">
        <Select
          value={sortField}
          items={sortOptions}
          ariaLabel={t('app.library.libraries.sort.label')}
          class="w-[15rem]"
          onchange={(value) => chooseSort(value)}
        />
        <div
          class="flex flex-none items-center gap-0.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-0.5"
          role="group"
          aria-label={t('app.library.modeLabel')}
        >
          <Button
            variant={viewMode === 'grid' ? 'primary' : 'ghost'}
            size="icon"
            title={t('app.library.mode.tiles')}
            ariaLabel={t('app.library.mode.tiles')}
            ariaPressed={viewMode === 'grid'}
            onclick={() => chooseViewMode('grid')}
          >
            <Icon name="grid" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'primary' : 'ghost'}
            size="icon"
            title={t('app.library.mode.list')}
            ariaLabel={t('app.library.mode.list')}
            ariaPressed={viewMode === 'list'}
            onclick={() => chooseViewMode('list')}
          >
            <Icon name="list" />
          </Button>
        </div>
      </div>
    </div>
  {/snippet}

  {#if error}
    <p class="role-body text-[var(--destructive)]" data-testid="libraries-error">{error}</p>
  {/if}

  {#if opening && progress}
    <div
      class="flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3"
    >
      <div class="flex items-center justify-between role-caption text-[var(--muted-foreground)]">
        <span>{t('app.library.libraries.indexing')}</span>
        <span>{progress.percent}%</span>
      </div>
      <Progress value={progress.percent} />
    </div>
  {/if}

  <!--
    Две колонки на всю доступную ширину: слева панель выбранной библиотеки,
    справа список всех библиотек. Выбор в списке только загружает библиотеку и
    показывает её сведения; книги открываются нажатием на название в панели.
  -->
  <div
    class="grid min-h-0 min-w-0 items-start gap-4 lg:flex-1 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-stretch lg:gap-6 wide:grid-cols-[26rem_minmax(0,1fr)]"
  >
    <!-- Панель стоит на месте всегда: без выбранной библиотеки она объясняет,
         что та не выбрана, а не исчезает, сдвигая список. -->
    <aside
      class="flex w-full min-w-0 flex-col gap-3 self-start rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 lg:h-full lg:self-stretch"
      data-testid="library-card"
    >
      <h2 class="m-0 role-caption text-[var(--muted-foreground)]">
        {t('app.library.libraries.card.title')}
      </h2>
      {#if selectedEntry}
        <!--
          Название — единственный вход к книгам: выбор в списке только
          показывает сведения, а переход начинается здесь.
        -->
        <button
          type="button"
          class="cursor-pointer self-start rounded-[var(--radius)] bg-transparent p-0 text-left transition-colors [font:inherit] hover:text-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:cursor-not-allowed"
          title={t('app.library.libraries.toBooks')}
          disabled={!selectedEntry.available || opening}
          data-testid="library-card-open"
          onclick={() => openLibraryBooks()}
        >
          <span class="block break-words role-heading text-[var(--foreground)]">
            {libraryName(selectedEntry.path)}
          </span>
        </button>

        <Badge variant="outline" class="self-start">
          {providerLabel(selectedEntry.providerName)}
        </Badge>

        <dl class="m-0 flex flex-col gap-2">
          <div class="flex flex-col gap-0.5">
            <dt class="role-caption text-[var(--muted-foreground)]">
              {t('app.library.libraries.locationShort')}
            </dt>
            <dd class="m-0 break-all font-mono text-xs text-[var(--foreground)]">
              {selectedEntry.path}
            </dd>
          </div>
          {#if selectedEntry.addedAtMillis}
            <div class="flex flex-col gap-0.5">
              <dt class="role-caption text-[var(--muted-foreground)]">
                {t('app.library.libraries.openedLabel')}
              </dt>
              <dd class="m-0 role-body">
                {formatDateTime(selectedEntry.addedAtMillis)}
              </dd>
            </div>
          {/if}
        </dl>

        <Button
          variant="ghost"
          size="sm"
          class="self-start"
          disabled={!selectedEntry.available}
          testId="library-card-folder"
          onclick={() => void openFolder(selectedEntry.path)}
        >
          <Icon name="folder" />
          {t('app.library.libraries.openFolder')}
        </Button>
      {:else}
        <div class="flex flex-col gap-1" data-testid="library-card-empty">
          <span class="m-0 role-heading text-[var(--foreground)]">
            {t('app.library.libraries.noSelection.title')}
          </span>
          <p class="m-0 role-body text-[var(--muted-foreground)]">
            {t('app.library.libraries.noSelection.description')}
          </p>
        </div>
      {/if}
    </aside>

    <!--
      Список библиотек: строки или плитка. Обе раскладки показывают одно и то же
      содержимое, поэтому переключение вида не меняет данные, а только подачу.
    -->
    <div class="flex min-h-0 min-w-0 flex-col" data-testid="libraries-view">
      {#if filtered.length === 0}
        <p class="text-[var(--muted-foreground)]" data-testid="libraries-not-found">
          {entries.length > 0 ? t('app.library.libraries.notFound') : t('app.list.notFound')}
        </p>
      {:else if viewMode === 'grid'}
        <ul
          class="grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]"
          data-testid="libraries-grid"
        >
          {#each filtered as entry (entry.path)}
            <li data-testid="library-item">
              <article
                class="flex h-full flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 transition-colors"
                class:opacity-60={!entry.available}
              >
                <div class="flex min-w-0 items-start gap-2">
                  <button
                    type="button"
                    class="min-w-0 flex-1 cursor-pointer bg-transparent p-0 text-left [font:inherit] hover:text-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:text-inherit"
                    disabled={!entry.available || opening}
                    data-testid="library-open"
                    onclick={() => void loadLibrary(entry.path)}
                  >
                    <span class="block truncate role-title" data-testid="library-name">
                      {libraryName(entry.path)}
                    </span>
                  </button>
                  <Badge variant="outline">{providerLabel(entry.providerName)}</Badge>
                </div>
                <div class="flex min-w-0 flex-col gap-1">
                  <span class="flex min-w-0 items-center gap-1.5 role-caption text-[var(--muted-foreground)]">
                    <Icon name="folder" class="h-3.5 w-3.5 shrink-0" />
                    <span
                      class="min-w-0 truncate"
                      class:text-[var(--destructive)]={!entry.available}
                      data-testid="library-path"
                    >
                      {entry.path}
                    </span>
                    {#if !entry.available}
                      <span
                        class="shrink-0 whitespace-nowrap text-[var(--destructive)]"
                        data-testid="library-missing"
                      >
                        {t('app.library.libraries.missing')}
                      </span>
                    {/if}
                  </span>
                  {#if formatDateTime(entry.addedAtMillis)}
                    <span class="flex items-center gap-1.5 role-caption text-[var(--muted-foreground)]">
                      <Icon name="clock" class="h-3.5 w-3.5 shrink-0" />
                      {formatDateTime(entry.addedAtMillis)}
                    </span>
                  {/if}
                </div>
              </article>
            </li>
          {/each}
        </ul>
      {:else}
        <EntityList
          items={filtered}
          key={(entry) => entry.path}
          itemTestId="library-item"
          notFound={entries.length > 0 && filtered.length === 0}
          notFoundTestId="libraries-not-found"
          disabled={(entry) => !entry.available || opening}
          selected={(entry) => entry.path === selectedEntry?.path}
          onSelect={(entry) => void loadLibrary(entry.path)}
          metaItems={metaItems}
          metaTestId="library-meta"
          actions={entryActions}
          actionsLabel={t('app.library.libraries.actionsLabel')}
          onAction={runEntryAction}
        >
          {#snippet titleContent(entry)}
            <!-- Индикатора доступности нет: состояние видно по метаданным. -->
            <strong class="min-w-0 flex-1 truncate role-title" data-testid="library-name">
              {libraryName(entry.path)}
            </strong>
          {/snippet}

          {#snippet trailing(entry)}
            <Badge variant="outline">{providerLabel(entry.providerName)}</Badge>
          {/snippet}
        </EntityList>
      {/if}
    </div>
  </div>
</PageShell>
