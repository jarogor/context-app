<script lang="ts">
  import { onMount } from 'svelte';
  import { Badge, Button, Input } from '@texture/ui';
  import { historyForget, historyList, listen, openDialog, operation, selectSource } from './bridge';
  import type { Book, BookFile, HistoryEntry, LibraryInfo } from './types';

  interface Props {
    onNavigate: (page: string, bookId?: number | string) => void;
    books: Book[];
    onBooksChange: (books: Book[]) => void;
  }

  type BookWithCover = Book & { coverUri?: string };

  let { onNavigate, books: cachedBooks, onBooksChange }: Props = $props();

  let books: BookWithCover[] = $state([]);
  let loading: boolean = $state(false);
  let error: string | null = $state(null);
  let importError: string | null = $state(null);
  let searchQuery: string = $state('');
  let libraryKind: LibraryInfo['kind'] = $state('portable');
  let sourceName: string | null = $state(null);
  let openingLibrary: boolean = $state(false);
  let indexingLibrary: boolean = $state(false);
  let progressText: string = $state('');
  let history: HistoryEntry[] = $state([]);
  let libraryPath: string | null = $state(null);
  let missingLibrary: string | null = $state(null);
  let librarySelected = $state(false);
  function stageLabel(stage: LibraryInfo['stage']): string {
    if (stage === 'opening') return 'Открытие библиотеки...';
    if (stage === 'scanning') return 'Сканирование книг...';
    if (stage === 'indexing') return 'Создание индекса...';
    if (stage === 'error') return 'Ошибка загрузки библиотеки';
    if (stage === 'idle') return 'Выберите библиотеку';
    return '';
  }

  function coverFile(book: Book): BookFile | undefined {
    return book.files.find((file) => file.kind === 'cover');
  }

  function normalizeBook(book: Record<string, unknown>): Book {
    const id = String(book.id ?? '');
    const authors = Array.isArray(book.authors)
      ? book.authors.map((author, index) => ({ id: index, name: String(author) }))
      : [];
    const files = Array.isArray(book.files)
      ? book.files.map((file, index) => {
          const value = file as Record<string, unknown>;
          return {
            id: index,
            book_id: id,
            kind: value.kind === 'cover' ? 'cover' : 'book',
            path: String(value.path ?? ''),
            format: String(value.format ?? ''),
          } satisfies BookFile;
        })
      : [];
    return {
      id,
      uuid: id,
      title: String(book.title ?? ''),
      created_at: '',
      updated_at: '',
      authors,
      series: [],
      tags: [],
      files,
    };
  }

  async function loadCovers(list: Book[]) {
    for (const book of list) {
      if (!coverFile(book)) {
        continue;
      }
      try {
        const value = (await operation('cover', { book_id: book.id })) as { data?: string; format?: string };
        const mime = value.format === 'png' ? 'image/png' : value.format === 'webp' ? 'image/webp' : 'image/jpeg';
        const coverUri = value.data ? `data:${mime};base64,${value.data}` : null;
        if (coverUri) {
          books = books.map((current) =>
            current.id === book.id ? { ...current, coverUri } : current,
          );
        }
      } catch {
        // A missing or temporarily unavailable cover must not block the catalog.
      }
    }
  }

  async function load() {
    if (!librarySelected) {
      loading = false;
      books = [];
      return;
    }
    loading = true;
    error = null;
    try {
      const response = searchQuery.trim()
        ? await operation<{ catalog?: { books?: Record<string, unknown>[] }; books?: Record<string, unknown>[] }>('search', { query: searchQuery })
        : await operation<{ catalog?: { books?: Record<string, unknown>[] }; books?: Record<string, unknown>[] }>('list');
      const rawBooks = response.books ?? response.catalog?.books ?? [];
      const list = rawBooks.map(normalizeBook);
      // Catalog loading must not wait for every cover request.
      books = list;
      onBooksChange(list);
      void loadCovers(list);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  async function loadLibraryInfo() {
    libraryKind = 'external';
    indexingLibrary = false;
    progressText = '';
  }

  async function waitForLibraryReady() {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (!openingLibrary && !indexingLibrary) {
        return 'ready';
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Открытие библиотеки превысило время ожидания');
  }

  async function loadHistory() {
    try {
      const response = await historyList();
      history = response.entries ?? [];
    } catch (e) {
      error = String(e);
    }
  }

  async function removeFromHistory(path: string) {
    try {
      await historyForget(path);
      await loadHistory();
    } catch (e) {
      error = String(e);
    }
  }

  async function openFromHistory(entry: HistoryEntry) {
    if (!entry.available) {
      return;
    }
    await openLibraryPath(entry.path);
  }

  async function openLibraryPath(path: string): Promise<boolean> {
    openingLibrary = true;
    indexingLibrary = false;
    progressText = 'Открытие библиотеки...';
    missingLibrary = null;
    try {
      const selected = await selectSource(path);
      librarySelected = true;
      sourceName = selected.provider_name;
      libraryPath = path;
      searchQuery = '';
      await loadHistory();
      openingLibrary = false;
      indexingLibrary = false;
      await load();
      return true;
    } catch (e) {
      missingLibrary = path;
      importError = String(e);
      openingLibrary = false;
      indexingLibrary = false;
      return false;
    }
  }

  function infoNeedsWait(): boolean {
    return openingLibrary || indexingLibrary;
  }

  async function updateSearch() {
    if (indexingLibrary) {
      return;
    }
    await load();
  }

  async function openInSystem(bookId: number | string) {
    importError = null;
    try {
      await operation('open_external', { book_id: bookId });
    } catch (e) {
      importError = String(e);
    }
  }

  function openBook(bookId: number | string) {
    onNavigate('reading', bookId);
  }

  async function openLibrary() {
    if (openingLibrary) {
      return;
    }
    importError = null;
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        await openLibraryPath(selected);
      }
    } catch (e) {
      importError = String(e);
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    void (async () => {
      unlisten = await listen('source-catalog-changed', () => {
        openingLibrary = false;
        indexingLibrary = false;
        progressText = '';
      });
      unlistenProgress = await listen<string>('source-progress', (value) => {
        indexingLibrary = value !== 'ready';
        progressText = value === 'scanning'
          ? 'Сканирование книг...'
          : value === 'indexing'
            ? 'Создание индекса...'
            : '';
      });
      unlistenError = await listen<string>('source-open-error', (value) => {
        openingLibrary = false;
        indexingLibrary = false;
        progressText = '';
        importError = value;
      });
      await loadLibraryInfo();
      await loadHistory();
      if (!indexingLibrary && books.length === 0 && cachedBooks.length > 0) {
        books = cachedBooks;
        loading = false;
        void loadCovers(cachedBooks);
      }
      if (librarySelected && !indexingLibrary && books.length === 0) {
        await load();
      }
    })();
    return () => {
      unlisten?.();
      unlistenProgress?.();
      unlistenError?.();
    };
  });
</script>

<div class="p-[var(--space-5)]">
  <div class="mb-[var(--space-4)] flex items-center justify-between gap-[var(--space-4)]">
    {#if sourceName}
      <span class="flex items-center gap-[var(--space-2)]">
        <Badge>{sourceName}</Badge>
        <strong class="text-base">
          {libraryPath?.split('/').filter(Boolean).pop() ?? 'Библиотека'}
        </strong>
      </span>
    {/if}
    <div class="flex flex-wrap gap-[var(--space-2)]">
      <Button variant="secondary" disabled={openingLibrary} onclick={openLibrary}>
        Открыть библиотеку
      </Button>
    </div>
  </div>

  <label
    class="mb-[var(--space-4)] flex flex-col gap-[var(--space-1)] text-[13px] text-[var(--color-text-muted)]"
  >
    <span>Поиск</span>
    <Input
      bind:value={searchQuery}
      oninput={updateSearch}
      disabled={indexingLibrary}
      placeholder="Название или автор"
      class="max-w-[420px]"
    />
  </label>

  {#if importError}
    <p class="text-[var(--color-danger)]">{importError}</p>
  {/if}

  {#if history.length > 0 && !indexingLibrary}
    <section class="my-[var(--space-5)] grid gap-[var(--space-2)]">
      <h2 class="text-base font-semibold">История библиотек</h2>
      {#each history as entry (entry.path)}
        <div class="flex items-center gap-[var(--space-2)]">
          <button
            class="flex flex-1 cursor-pointer flex-col gap-[3px] rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-2)] text-left [font:inherit] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-muted)]"
            type="button"
            disabled={!entry.available}
            onclick={() => openFromHistory(entry)}
          >
            <span class="flex items-center gap-[var(--space-2)]">
              <span
                class="inline-block h-2 w-2 rounded-full"
                style:background={entry.available
                  ? 'var(--color-success)'
                  : 'var(--color-border-strong)'}
              ></span>
              <Badge>{entry.provider_name}</Badge>
              <strong>{entry.path.split('/').filter(Boolean).pop() ?? entry.path}</strong>
              <span class="text-xs text-[var(--color-text-muted)]">
                {entry.available ? 'доступна' : 'недоступна'}
              </span>
            </span>
            <span class="text-xs text-[var(--color-text-muted)] [overflow-wrap:anywhere]">
              {entry.path}
            </span>
          </button>
          <Button variant="danger" size="sm" onclick={() => removeFromHistory(entry.path)}>
            Убрать
          </Button>
        </div>
      {/each}
    </section>
  {/if}

  {#if !librarySelected && !loading}
    <p class="text-[var(--color-text-muted)]">Выберите библиотеку для начала работы.</p>
  {:else if indexingLibrary}
    <p class="text-[var(--color-text-muted)]">{progressText || 'Открытие библиотеки...'}</p>
  {:else if loading && !indexingLibrary}
    <p class="text-[var(--color-text-muted)]">Загрузка...</p>
  {:else if error}
    <p class="text-[var(--color-danger)]">{error}</p>
  {:else if books.length === 0}
    <p class="text-[var(--color-text-muted)]">
      {libraryKind === 'external'
        ? 'Источник не содержит книг, найденных сканером.'
        : 'Библиотека пуста.'}
    </p>
  {:else}
    <ul
      class="grid list-none gap-[var(--space-5)] p-0 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]"
    >
      {#each books as book (book.id)}
        <li>
          <button
            class="flex w-full cursor-pointer flex-col gap-[var(--space-2)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-2)] text-left [font:inherit] hover:shadow-[var(--shadow-sm)]"
            type="button"
            onclick={() => {
              if (!indexingLibrary) openBook(book.id);
            }}
          >
            {#if book.coverUri}
              <img class="aspect-[2/3] w-full rounded-[var(--radius-sm)] object-cover" src={book.coverUri} alt="" />
            {:else}
              <div
                class="aspect-[2/3] w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]"
                aria-hidden="true"
              ></div>
            {/if}
            <div class="book-info">
              <h2 class="text-[15px] font-semibold">{book.title}</h2>
              <p class="mt-[var(--space-1)] text-[13px] text-[var(--color-text-muted)]">
                {book.authors.map((a) => a.name).join(', ')}
              </p>
              <span
                class="mt-[var(--space-2)] inline-block cursor-pointer text-xs text-[var(--color-primary)] hover:underline"
                role="button"
                tabindex="0"
                onclick={(event) => {
                  event.stopPropagation();
                  openInSystem(book.id);
                }}
                onkeydown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    openInSystem(book.id);
                  }
                }}>Открыть в системе</span
              >
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
