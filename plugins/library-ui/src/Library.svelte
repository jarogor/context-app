<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke, listen, openDialog } from './bridge';
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

  async function loadCovers(list: Book[]) {
    for (const book of list) {
      if (!coverFile(book)) {
        continue;
      }
      try {
        const coverUri = (await invoke('get_cover', { bookId: book.id })) as string | null;
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
      const list: Book[] = searchQuery.trim()
        ? await invoke('search_books', { query: searchQuery })
        : await invoke('list_books');
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
    try {
      const info = (await invoke('get_library_info')) as LibraryInfo;
      libraryKind = info.kind;
      sourceName = info.source_name;
      indexingLibrary = info.stage === 'scanning' || info.stage === 'indexing';
      progressText = stageLabel(info.stage);
      librarySelected = info.stage === 'ready' || info.stage === 'scanning' || info.stage === 'indexing';
    } catch (e) {
      error = String(e);
    }
  }

  async function waitForLibraryReady() {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const info = (await invoke('get_library_info')) as LibraryInfo;
      libraryKind = info.kind;
      sourceName = info.source_name;
      indexingLibrary = info.stage === 'scanning' || info.stage === 'indexing';
      progressText = stageLabel(info.stage);
      librarySelected = info.stage === 'ready' || info.stage === 'scanning' || info.stage === 'indexing';
      if (info.stage === 'ready' || info.stage === 'error') {
        return info.stage;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Открытие библиотеки превысило время ожидания');
  }

  async function loadCachedLibraries() {
    try {
      cachedLibraries = (await invoke('list_cached_libraries')) as CachedLibrary[];
    } catch (e) {
      error = String(e);
    }
  }

  async function chooseCachedLibrary(path: string) {
    await openLibraryPath(path);
  }

  async function openLibraryPath(path: string) {
    openingLibrary = true;
    indexingLibrary = false;
    progressText = 'Открытие библиотеки...';
    missingLibrary = null;
    try {
      await invoke('open_library', { path });
      searchQuery = '';
      await loadLibraryInfo();
      if (!librarySelected) {
        loading = false;
      }
      if (infoNeedsWait()) {
        const stage = await waitForLibraryReady();
        if (stage === 'error') {
          throw new Error('Не удалось открыть библиотеку');
        }
      }
      openingLibrary = false;
      indexingLibrary = false;
      await load();
    } catch (e) {
      missingLibrary = path;
      importError = String(e);
      openingLibrary = false;
      indexingLibrary = false;
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
      await invoke('open_book_in_system', { bookId });
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
      unlisten = await listen('library-catalog-changed', () => {
        openingLibrary = false;
        indexingLibrary = false;
        progressText = '';
      });
      unlistenProgress = await listen<string>('library-progress', (value) => {
        indexingLibrary = value !== 'ready';
        progressText = value === 'scanning'
          ? 'Сканирование книг...'
          : value === 'indexing'
            ? 'Создание индекса...'
            : '';
      });
      unlistenError = await listen<string>('library-open-error', (value) => {
        openingLibrary = false;
        indexingLibrary = false;
        progressText = '';
        importError = value;
      });
      await loadLibraryInfo();
      if (indexingLibrary) {
        const stage = await waitForLibraryReady();
        if (stage === 'error') {
          importError = 'Не удалось открыть библиотеку';
        }
      }
      if (librarySelected) {
        await loadCachedLibraries();
      }
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

<div class="library">
   <div class="header">
<h1>Библиотека</h1>
      {#if libraryKind === 'external' && sourceName}
        <span class="source-badge" title="Внешний источник">
          {sourceName}
        </span>
      {/if}
      <div class="header-actions">
         <button
          class="open-library-button"
          type="button"
          onclick={openLibrary}
          disabled={openingLibrary}
        >
          Открыть библиотеку
        </button>
     </div>
   </div>

  <label class="search">
    <span>Поиск</span>
    <input bind:value={searchQuery} oninput={updateSearch} disabled={indexingLibrary} placeholder="Название или автор" />
  </label>

  {#if importError}
    <p class="state error">{importError}</p>
  {/if}

  {#if cachedLibraries.length > 0 && !indexingLibrary && books.length === 0}
    <section class="cached-libraries">
      <h2>Сохранённые библиотеки</h2>
      {#each cachedLibraries as cached}
        <button
          class="cached-library"
          type="button"
          disabled={!cached.available}
          onclick={() => chooseCachedLibrary(cached.path)}
        >
          <strong>{cached.available ? 'Открыть' : 'Недоступна'}</strong>
          <span>{cached.path}</span>
        </button>
      {/each}
    </section>
  {/if}

  {#if !librarySelected && !loading}
    <p class="state empty-state">Выберите библиотеку для начала работы.</p>
  {:else if indexingLibrary}
    <p class="state">{progressText || 'Открытие библиотеки...'}</p>
  {:else if loading && !indexingLibrary}
    <p class="state">Загрузка...</p>
  {:else if error}
    <p class="state error">{error}</p>
  {:else if books.length === 0}
    <p class="state empty-state">
      {libraryKind === 'external'
        ? 'Источник не содержит книг, найденных сканером.'
        : 'Библиотека пуста.'}
    </p>
  {:else}
    <ul class="book-list">
      {#each books as book (book.id)}
        <li>
          <button
            class="book-card"
            type="button"
             onclick={() => {
               if (!indexingLibrary) openBook(book.id);
             }}
          >
            {#if book.coverUri}
              <img class="cover" src={book.coverUri} alt="" />
            {:else}
              <div class="cover cover-placeholder" aria-hidden="true"></div>
            {/if}
            <div class="book-info">
              <h2>{book.title}</h2>
              <p class="authors">{book.authors.map((a) => a.name).join(', ')}</p>
              <span
                class="open-link"
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

<style>
  .library {
    padding: 24px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }
  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .source-badge {
    padding: 4px 10px;
    border: 1px solid #7f8c8d;
    border-radius: 999px;
    background: #ecf0f1;
    color: #566573;
    font-size: 12px;
    font-weight: bold;
  }
  .open-library-button {
    padding: 8px 14px;
    border: 1px solid #5a8fda;
    border-radius: 6px;
    background: #fff;
    color: #315f9e;
    font: inherit;
    cursor: pointer;
  }
  .open-library-button:hover:not(:disabled) {
    background: #eef5ff;
  }
  .open-library-button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .search {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
    color: #666;
    font-size: 13px;
  }
  .search input {
    width: min(100%, 420px);
    padding: 9px 11px;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    font: inherit;
  }
  h1 {
    margin-bottom: 0;
  }
  .state {
    color: #888;
  }
  .error {
    color: #c0392b;
  }
  .book-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 20px;
    padding: 0;
    margin: 0;
  }
  .book-card {
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: #fff;
    width: 100%;
    text-align: left;
    font: inherit;
    transition: box-shadow 0.2s;
  }
  .book-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }
  .cover {
    width: 100%;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: 4px;
  }
  .cover-placeholder {
    background: #dcdcdc;
  }
  .book-info h2 {
    font-size: 15px;
    margin: 0;
  }
  .authors {
    margin: 4px 0 0;
    font-size: 13px;
    color: #666;
  }
  .open-link {
    display: inline-block;
    margin-top: 8px;
    color: #5a8fda;
    font-size: 12px;
    cursor: pointer;
  }
  .open-link:hover {
    text-decoration: underline;
  }
  .cached-libraries {
    display: grid;
    gap: 8px;
    margin: 24px 0;
  }
  .cached-libraries h2 {
    margin: 0;
    font-size: 16px;
  }
  .cached-library {
    display: grid;
    gap: 3px;
    padding: 10px 12px;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    background: #fff;
    text-align: left;
    font: inherit;
    cursor: pointer;
  }
  .cached-library:disabled {
    color: #999;
    cursor: not-allowed;
  }
  .cached-library span {
    overflow-wrap: anywhere;
    color: #666;
    font-size: 12px;
  }
</style>
