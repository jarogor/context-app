<script lang="ts">
  import { onMount } from 'svelte';
  import { Badge, Button, Input } from '@booklib/ui';
  import { invoke, listen, openDialog, operation, pluginOperation } from './bridge';
  import type { Book, BookFile, CachedLibrary, LibraryInfo } from './types';

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
  let cachedLibraries: CachedLibrary[] = $state([]);
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
    libraryKind = 'portable';
    sourceName = 'library';
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

  async function loadCachedLibraries() {
    try {
      const response = await pluginOperation<{ paths?: CachedLibrary[] }>('recent_list');
      const pluginPaths = response.paths ?? [];
      cachedLibraries = pluginPaths.filter(
        (item): item is CachedLibrary =>
          Boolean(item) && typeof item.path === 'string' && item.path.trim().length > 0,
      );
    } catch (e) {
      error = String(e);
    }
  }

  async function chooseCachedLibrary(path: string) {
    await openLibraryPath(path);
  }

  async function openLibraryPath(path: string, mode?: 'portable', remember = true): Promise<boolean> {
    openingLibrary = true;
    indexingLibrary = false;
    progressText = 'Открытие библиотеки...';
    missingLibrary = null;
    try {
      await operation('open', { mode: mode ?? 'external' }, { root: path, writable: mode === 'portable' });
      librarySelected = true;
      if (remember) {
        cachedLibraries = [{ path, available: true }, ...cachedLibraries.filter((item) => item.path !== path)];
        await operation('recent_remember', { path });
      }
      searchQuery = '';
      await loadLibraryInfo();
      if (!librarySelected) {
        loading = false;
      }
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
      await loadCachedLibraries();
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
    {#if libraryKind === 'external' && sourceName}
      <Badge>{sourceName}</Badge>
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

  {#if cachedLibraries.length > 0 && !indexingLibrary && books.length === 0}
    <section class="my-[var(--space-5)] grid gap-[var(--space-2)]">
      <h2 class="text-base font-semibold">Сохранённые библиотеки</h2>
      {#each cachedLibraries as cached}
        <button
          class="grid gap-[3px] rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-2)] text-left [font:inherit] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
          type="button"
          disabled={!cached.available}
          onclick={() => chooseCachedLibrary(cached.path)}
        >
          <strong>{cached.available ? 'Открыть' : 'Недоступна'}</strong>
          <span class="text-xs text-[var(--color-text-muted)] [overflow-wrap:anywhere]">{cached.path}</span>
        </button>
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
