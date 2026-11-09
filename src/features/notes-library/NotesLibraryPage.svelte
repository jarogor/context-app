<script lang="ts">
  import { t } from '@context/i18n';
  import {
    Button,
    EmptyState,
    EntityList,
    ErrorState,
    ErrorToast,
    Icon,
    IconButton,
    Input,
    PageShell,
    SidePanel,
    Skeleton,
    Spinner,
    createAsyncState,
    type MenuAction,
    type MetaItem,
  } from '@context/ui';
  import { formatDateTime } from '../../shared/format';
  import NoteEntry from '../notes/NoteEntry.svelte';
  import {
    bindNoteSetBook,
    completeNoteSetImport,
    exportNoteSet,
    pickBookFile,
    prepareNoteSetImport,
    type NoteSet,
    type Note,
  } from '../notes/notes';
  import { bookChoices, type BookChoice } from '../library/library';
  import SetBookDialog, { type SetBookTarget } from './SetBookDialog.svelte';
  import { bookFileName, librarySets, noteCountLabel } from './notes-library';
  import { DEFAULT_PALETTE, DEFAULT_READER_THEME, type PaletteId, type ReaderThemeId } from '@context/ui';

  /** Рабочее место для выбора места открытия набора. */
  interface WorkspaceOption {
    /** Идентификатор рабочего места. */
    id: string;
    /** Человекочитаемое имя. */
    name: string;
  }

  /** Реестр наборов заметок всех книг. */
  interface Props {
    /** Наборы всех книг (агрегат `list_all_sets`). */
    sets: NoteSet[];
    /** Рабочие места реестра. */
    workspaces?: WorkspaceOption[];
    /** Где открывали наборы: набор → места, свежие первыми. */
    workspaceHistory?: Record<string, string[]>;
    /** Тема области чтения: цвет меток заметок следует ей. */
    readerTheme?: ReaderThemeId;
    /** Палитра оформления: общий реестр дизайн-системы. */
    palette?: PaletteId;
    /** Загружается ли реестр. */
    loading?: boolean;
    /** Ошибка загрузки реестра, иначе пустая строка. */
    error?: string;
    /** Открыть набор в выбранном рабочем месте. */
    onOpenSet?: (set: NoteSet, workspaceId: string) => void;
    /** Открыть заметку набора в выбранном рабочем месте. */
    onOpenNote?: (set: NoteSet, note: Note, workspaceId: string) => void;
    /** Создать рабочее место и открыть в нём набор. */
    onCreateWorkspace?: (set: NoteSet, name: string, note: Note | null) => void;
  }

  let {
    sets,
    workspaces = [],
    workspaceHistory = {},
    readerTheme = DEFAULT_READER_THEME,
    palette = DEFAULT_PALETTE,
    loading = false,
    error = '',
    onOpenSet,
    onOpenNote,
    onCreateWorkspace,
  }: Props = $props();

  /** Состояние импорта, экспорта и привязки книги. */
  const fileState = createAsyncState();

  /** Набор, которому пользователь указывает книгу (диалог открыт). */
  let bindTarget = $state<SetBookTarget | null>(null);

  /** Книги библиотеки для диалога выбора. */
  let bindBooks = $state<BookChoice[]>([]);

  /** Загружаются ли книги библиотеки. */
  let booksLoading = $state(false);

  /** Ошибка загрузки книг библиотеки, иначе пустая строка. */
  let booksError = $state('');

  /** Запрос поиска по реестру. */
  let query = $state('');

  /** Идентификаторы раскрытых наборов. */
  let expandedIds = $state<string[]>([]);

  /** Набор, для которого открыта панель выбора места. */
  let selectedSetId = $state<string | null>(null);

  /** Заметка, которая откроется в выбранном месте. */
  let selectedNoteId = $state<string | null>(null);

  /** Запрос поиска рабочего места в панели. */
  let workspaceQuery = $state('');

  /** Показана ли форма создания рабочего места. */
  let creating = $state(false);

  /** Черновик имени нового рабочего места. */
  let newWorkspaceName = $state('');

  /** Наборы реестра с учётом поиска. */
  const view = $derived(librarySets(sets, query));

  /** При непустом поиске наборы раскрываются, чтобы были видны найденные заметки. */
  const searching = $derived(query.trim().length > 0);

  /** Общее число заметок в реестре. */
  const totalNotes = $derived(sets.reduce((sum, set) => sum + set.notes.length, 0));

  /** Текущие имена рабочих мест реестра. */
  const workspaceNames = $derived(new Map(workspaces.map((item) => [item.id, item.name])));

  /** Набор, для которого открыта панель. */
  const selectedSet = $derived(sets.find((set) => set.id === selectedSetId) ?? null);

  /** Места, где набор уже открывали (только существующие, свежие первыми). */
  const history = $derived.by(() => {
    const ids = selectedSetId ? workspaceHistory[selectedSetId] ?? [] : [];
    const byId = new Map(workspaces.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is WorkspaceOption => !!item);
  });

  /** Остальные рабочие места, где набор ещё не открывали. */
  const otherWorkspaces = $derived.by(() => {
    const known = new Set(history.map((item) => item.id));
    return workspaces.filter((item) => !known.has(item.id));
  });

  /** Совпадение рабочего места с запросом панели. */
  function matchesWorkspace(item: WorkspaceOption): boolean {
    const needle = workspaceQuery.trim().toLowerCase();
    return !needle || item.name.toLowerCase().includes(needle);
  }

  const filteredHistory = $derived(history.filter(matchesWorkspace));
  const filteredOthers = $derived(otherWorkspaces.filter(matchesWorkspace));

  /** Поиск рабочего места не дал результатов при непустом запросе. */
  const workspaceNotFound = $derived(
    workspaceQuery.trim().length > 0 &&
      filteredHistory.length === 0 &&
      filteredOthers.length === 0,
  );

  /** Последнее место набора, если оно ещё существует. */
  function lastWorkspaceName(set: (typeof view)[number]): string {
    for (const id of workspaceHistory[set.id] ?? []) {
      const name = workspaceNames.get(id);
      if (name) {
        return name;
      }
    }
    return '';
  }

  /** Раскрыт ли набор: раскрытые пользователем или поиск по содержимому. */
  function isExpanded(id: string): boolean {
    return searching || expandedIds.includes(id);
  }

  /** Переключение раскрытия набора. */
  function toggle(id: string) {
    expandedIds = expandedIds.includes(id)
      ? expandedIds.filter((candidate) => candidate !== id)
      : [...expandedIds, id];
  }

  /** Открытие панели выбора места для набора; набор без книги не открывается. */
  function selectSet(id: string) {
    if (!bookBound(id)) {
      return;
    }
    selectedSetId = id;
    selectedNoteId = null;
    workspaceQuery = '';
    creating = false;
    newWorkspaceName = '';
  }

  /** Выбор заметки: панель выбора места открывается для её набора. */
  function selectNote(setId: string, note: Note) {
    if (!bookBound(setId)) {
      return;
    }
    selectedSetId = setId;
    selectedNoteId = note.id;
    creating = false;
  }

  /** Указана ли у набора книга: без неё набор нельзя открыть в рабочем месте. */
  function bookBound(setId: string): boolean {
    return view.some((set) => set.id === setId && set.hasBook);
  }

  /** Закрытие панели; пользователь остаётся в реестре. */
  function closePanel() {
    selectedSetId = null;
    selectedNoteId = null;
    creating = false;
    newWorkspaceName = '';
  }

  /** Пункты меню набора: заметки, книга и экспорт. */
  function actionsFor(set: (typeof view)[number]): MenuAction[] {
    return [
      {
        id: 'toggle',
        label: isExpanded(set.id)
          ? t('app.notes.library.hideNotes')
          : t('app.notes.library.showNotes'),
      },
      {
        id: 'bind',
        label: set.hasBook
          ? t('app.notes.library.rebindBook')
          : t('app.notes.library.bindBook'),
        icon: 'book',
        separatorBefore: true,
        disabled: fileState.loading,
      },
      {
        id: 'export',
        label: t('app.notes.library.export'),
        icon: 'upload',
        disabled: fileState.loading,
      },
    ];
  }

  /** Выполнение пункта меню набора. */
  function runSetAction(set: (typeof view)[number], action: string) {
    if (action === 'export') {
      void runExport(set);
      return;
    }
    if (action === 'bind') {
      void openBind(set);
      return;
    }
    toggle(set.id);
  }

  /** Экспорт набора в файл: содержимое готовит плагин, сохраняет ядро. */
  async function runExport(set: (typeof view)[number]) {
    await fileState.run(() => exportNoteSet(set.id, set.bookName));
  }

  /** Импорт набора: набор принимается всегда, книга указывается позже. */
  async function runImport() {
    const prepared = await fileState.run(() => prepareNoteSetImport());
    if (!prepared) {
      return;
    }
    await fileState.run(() => completeNoteSetImport(prepared));
  }

  /** Открытие диалога указания книги для набора. */
  async function openBind(set: (typeof view)[number]) {
    bindTarget = {
      id: set.id,
      name: set.name,
      noteCount: set.noteItems.length,
      bookHint: set.bookHint || set.bookName,
    };
    await loadBooks();
  }

  /** Загрузка книг библиотеки для диалога выбора. */
  async function loadBooks() {
    booksLoading = true;
    booksError = '';
    try {
      bindBooks = await bookChoices();
    } catch (cause) {
      booksError = String(cause);
    } finally {
      booksLoading = false;
    }
  }

  /** Привязка набора к выбранной книге этого хранилища. */
  async function acceptBind(book: { key: string; title: string }) {
    const target = bindTarget;
    if (!target) {
      return;
    }
    const updated = await fileState.run(() => bindNoteSetBook(target.id, book));
    if (updated) {
      closeBind();
    }
  }

  /** Указание файла книги, которой нет в библиотеке. */
  async function pickBindBookFile() {
    const book = await fileState.run(() => pickBookFile());
    if (book) {
      await acceptBind(book);
    }
  }

  /** Закрытие диалога указания книги. */
  function closeBind() {
    bindTarget = null;
    bindBooks = [];
    booksError = '';
  }

  /** Открытие набора (и выбранной заметки) в указанном месте. */
  function chooseWorkspace(workspaceId: string) {
    const set = selectedSet;
    if (!set) {
      return;
    }
    const note = selectedNoteId ? set.notes.find((item) => item.id === selectedNoteId) ?? null : null;
    if (note) {
      onOpenNote?.(set, note, workspaceId);
    } else {
      onOpenSet?.(set, workspaceId);
    }
  }

  /** Создание рабочего места для выбранного набора. */
  function createWorkspace() {
    const set = selectedSet;
    const name = newWorkspaceName.trim();
    if (!set || !name) {
      return;
    }
    const note = selectedNoteId ? set.notes.find((item) => item.id === selectedNoteId) ?? null : null;
    onCreateWorkspace?.(set, name, note);
  }

  /** Показ формы создания рабочего места. */
  function startCreating() {
    creating = true;
    newWorkspaceName = '';
  }

  /** Скрытие формы создания. */
  function cancelCreating() {
    creating = false;
    newWorkspaceName = '';
  }

  /** Метаинформация набора: дата, файл книги и последнее место. */
  function metaItems(set: (typeof view)[number]): MetaItem[] {
    const changed = formatDateTime(set.updatedAtMillis);
    const created = formatDateTime(set.createdAtMillis);
    const items: MetaItem[] = [];
    if (changed) {
      items.push({
        icon: 'calendar',
        value: changed,
        title: t('app.notes.library.changed', { date: changed }),
      });
    } else if (created) {
      items.push({
        icon: 'calendar',
        value: created,
        title: t('app.notes.library.created', { date: created }),
      });
    }
    items.push({
      icon: 'book',
      value: set.hasBook ? set.bookName : t('app.notes.library.noBook'),
      title: set.hasBook ? set.bookName : t('app.notes.library.noBookHint'),
      // Без книги набор не открыть: надпись выделена, чтобы это было видно сразу.
      strong: !set.hasBook,
      mono: set.hasBook,
      testId: set.hasBook ? 'notes-library-book' : 'notes-library-no-book',
    });
    const workspace = lastWorkspaceName(set);
    if (workspace) {
      items.push({
        icon: 'workspace',
        value: workspace,
        title: t('app.notes.library.workspace', { name: workspace }),
        testId: 'notes-library-workspace',
      });
    }
    return items;
  }
</script>

  <PageShell
    testId="notes-library"
    {loading}
    {error}
    empty={!loading && !error && view.length === 0}
    emptyIcon="note"
    emptyTitle={query ? t('app.notes.library.notFound.title') : t('app.notes.library.empty.title')}
    emptyTestId="notes-library-empty"
  >
    {#snippet loadingContent()}
      <div class="p-4" data-testid="notes-library-loading">
        <Skeleton rows={5} />
      </div>
    {/snippet}

    {#snippet errorContent()}
      <div class="p-4">
        <ErrorState message={error} testId="notes-library-error" />
      </div>
    {/snippet}

    {#snippet emptyContent()}
      <EmptyState
        icon="note"
        title={query ? t('app.notes.library.notFound.title') : t('app.notes.library.empty.title')}
        description={query
          ? t('app.search.changeQuery')
          : t('app.notes.library.empty.description')}
        testId="notes-library-empty"
      />
    {/snippet}

    {#snippet controls()}
      <div class="flex w-full min-w-0 items-center gap-2 tablet:w-auto tablet:flex-none">
        <Input
          bind:value={query}
          placeholder={t('app.search.notes.placeholder')}
          ariaLabel={t('app.search.notes.placeholder')}
          icon="search"
          clearable
          class="min-w-0 flex-1 tablet:w-[24rem] tablet:flex-none"
        />
        <span
          class="flex-none role-caption text-[var(--muted-foreground)]"
          data-testid="notes-filter-counter"
        >
          {t('app.search.filter', { shown: view.length, total: sets.length })}
        </span>
        {#if sets.length > 0}
          <!-- Общее число заметок стоит рядом со счётчиком наборов: оба числа
               говорят о том, что лежит в реестре, и читаются одним взглядом. -->
          <dl
            class="flex flex-none items-center gap-1.5 role-caption text-[var(--muted-foreground)]"
            data-testid="notes-total-counter"
          >
            <dt>{t('app.notes.library.notes')}</dt>
            <dd>{totalNotes}</dd>
          </dl>
        {/if}
      </div>
      <div class="flex w-full items-center gap-2 tablet:ml-auto tablet:w-auto">
        <Button
          variant="secondary"
          size="sm"
          disabled={fileState.loading}
          title={t('app.notes.library.importHint')}
          ariaLabel={t('app.notes.library.import')}
          onclick={runImport}
        >
          {#if fileState.loading}
            <Spinner class="h-4 w-4" />
          {/if}
          <Icon name="download" />
          {t('app.notes.library.import')}
        </Button>
      </div>
    {/snippet}

    <EntityList
      items={view}
      key={(set) => set.id}
      container="div"
      itemTestId="notes-library-set"
      buttonTestId="notes-library-set-toggle"
      expanded={(set) => isExpanded(set.id)}
      selected={(set) => selectedSetId === set.id}
      disabled={(set) => !set.hasBook}
      onSelect={(set) => selectSet(set.id)}
      metaItems={metaItems}
      metaTestId="notes-library-set-meta"
      actions={actionsFor}
      actionsLabel={t('app.notes.library.actionsLabel')}
      onAction={(set, action) => runSetAction(set, action)}
    >
      {#snippet titleContent(set)}
        <span
          class="inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] transition-transform"
          class:border-[var(--primary-border)]={isExpanded(set.id)}
          class:text-[var(--primary)]={isExpanded(set.id)}
          class:rotate-90={isExpanded(set.id)}
        >
          <Icon name="chevron-right" class="h-3.5 w-3.5" />
        </span>
        <span class="min-w-0 flex-1 truncate role-title" data-testid="notes-library-set-name">
          {set.name}
        </span>
      {/snippet}

      {#snippet trailing(set)}
        <span class="role-caption text-[var(--muted-foreground)]" data-testid="notes-library-count">
          {noteCountLabel(set.noteItems.length)}
        </span>
      {/snippet}

      {#snippet body(set)}
        {#if isExpanded(set.id)}
          {#if set.noteItems.length === 0}
            <p class="px-3 role-body text-[var(--muted-foreground)]" data-testid="notes-library-set-empty">
              {t('app.notes.library.noNotesInSet')}
            </p>
          {:else}
            <div
              class="border-t border-[var(--divider)] bg-[var(--surface-inset)] p-2 pl-4"
              data-testid="notes-library-notes"
            >
              <ul class="m-0 flex list-none flex-col gap-1 p-0">
                {#each set.noteItems as item (item.note.id)}
                  <NoteEntry
                    {item}
                    {readerTheme}
                    {palette}
                    selected={selectedNoteId === item.note.id}
                    onclick={(note) => selectNote(set.id, note)}
                  />
                {/each}
              </ul>
            </div>
          {/if}
        {/if}
      {/snippet}
    </EntityList>
    {#snippet side()}
    {#if selectedSet}
        <SidePanel
          title={selectedSet.name}
          testId="notes-set-panel"
          onClose={closePanel}
          class="w-[var(--notes-panel-width)]"
        >
          {#snippet search()}
            <Input
              bind:value={workspaceQuery}
              placeholder={t('app.notes.library.workspaceSearch')}
              ariaLabel={t('app.notes.library.workspaceSearch')}
              icon="search"
              clearable
            />
          {/snippet}

          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
            <code
              class="block break-all rounded-[var(--radius)] bg-[var(--surface-inset)] px-2 py-1.5 font-mono role-caption text-[var(--foreground)]"
              data-testid="notes-set-book"
            >
              {bookFileName(selectedSet.bookKey)}
            </code>

            {#if filteredHistory.length > 0}
              <section class="flex flex-col gap-2">
                <h3 class="role-subtitle text-[var(--muted-foreground)]">
                  {t('app.notes.library.history')}
                </h3>
                <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                  {#each filteredHistory as item (item.id)}
                    <li>
                      <button
                        type="button"
                        class="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left role-body transition-colors [font:inherit] hover:bg-[var(--surface-hover)]"
                        data-testid="notes-set-history-item"
                        onclick={() => chooseWorkspace(item.id)}
                      >
                        <Icon name="workspace" class="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                        <span class="min-w-0 flex-1 truncate">{item.name}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              </section>
            {/if}

            {#if filteredOthers.length > 0}
              <section class="flex flex-col gap-2">
                <h3 class="role-subtitle text-[var(--muted-foreground)]">
                  {t('app.notes.library.allWorkspaces')}
                </h3>
                <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                  {#each filteredOthers as item (item.id)}
                    <li>
                      <button
                        type="button"
                        class="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left role-body transition-colors [font:inherit] hover:bg-[var(--surface-hover)]"
                        data-testid="notes-set-workspace-item"
                        onclick={() => chooseWorkspace(item.id)}
                      >
                        <Icon name="workspace" class="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                        <span class="min-w-0 flex-1 truncate">{item.name}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              </section>
            {/if}

            {#if workspaceNotFound}
              <p class="text-[var(--muted-foreground)]" data-testid="notes-set-workspace-empty">
                {t('app.notes.library.noWorkspacesFound')}
              </p>
            {/if}

            <div class="mt-auto flex flex-col gap-2 border-t border-[var(--border)] pt-3">
              {#if creating}
                <div class="flex items-center gap-2">
                  <Input
                    bind:value={newWorkspaceName}
                    placeholder={t('app.notes.library.newWorkspace')}
                    ariaLabel={t('app.notes.library.newWorkspace')}
                    class="min-w-0 flex-1"
                    onkeydown={(event) => {
                      if (event.key === 'Enter') {
                        createWorkspace();
                      }
                    }}
                  />
                  <IconButton
                    action="add"
                    title={t('app.notes.library.create')}
                    ariaLabel={t('app.notes.library.create')}
                    disabled={!newWorkspaceName.trim()}
                    onclick={createWorkspace}
                  />
                  <button
                    type="button"
                    class="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    title={t('app.notes.library.cancelCreate')}
                    aria-label={t('app.notes.library.cancelCreate')}
                    onclick={cancelCreating}
                  >
                    <Icon name="close" class="h-4 w-4" />
                  </button>
                </div>
              {:else}
                <button
                  type="button"
                  class="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-1 py-1 text-left role-body text-[var(--muted-foreground)] transition-colors [font:inherit] hover:text-[var(--foreground)]"
                  data-testid="notes-set-create-workspace"
                  onclick={startCreating}
                >
                  <Icon name="plus" class="h-4 w-4 shrink-0" />
                  {t('app.notes.library.createWorkspace')}
                </button>
              {/if}
            </div>
          </div>
        </SidePanel>
      {/if}
  {/snippet}
</PageShell>

<SetBookDialog
  open={bindTarget !== null}
  target={bindTarget}
  books={bindBooks}
  loading={booksLoading}
  error={booksError}
  onSelect={acceptBind}
  onPickFile={pickBindBookFile}
  onClose={closeBind}
/>

<ErrorToast message={fileState.error} />
