<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import type { Book, BookFile, LibraryInfo } from '../types';

  interface Props {
    onNavigate: (page: string, bookId?: number) => void;
  }

  type BookWithCover = Book & { coverUri?: string };

  let { onNavigate }: Props = $props();

  let books: BookWithCover[] = $state([]);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let importing: boolean = $state(false);
  let importError: string | null = $state(null);
  let searchQuery: string = $state('');
  let libraryKind: LibraryInfo['kind'] = $state('portable');
  let openingLibrary: boolean = $state(false);

  function coverFile(book: Book): BookFile | undefined {
    return book.files.find((f) => f.kind === 'cover');
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const list: Book[] = searchQuery.trim()
        ? await invoke('search_books', { query: searchQuery })
        : await invoke('list_books');
      const withCovers = await Promise.all(
        list.map(async (book): Promise<BookWithCover> => {
          if (!coverFile(book)) {
            return book;
          }
          const coverUri = (await invoke('get_cover', { bookId: book.id })) as string | null;
          return coverUri ? { ...book, coverUri } : book;
        }),
      );
      books = withCovers;
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
    } catch (e) {
      error = String(e);
    }
  }

  async function updateSearch() {
    await load();
  }

  async function openInSystem(bookId: number) {
    importError = null;
    try {
      await invoke('open_book_in_system', { bookId });
    } catch (e) {
      importError = String(e);
    }
  }

  function openBook(bookId: number) {
    if (libraryKind === 'calibre') {
      void openInSystem(bookId);
      return;
    }
    onNavigate('reading', bookId);
  }

  async function openLibrary() {
    openingLibrary = true;
    importError = null;
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        await invoke('open_library', { path: selected });
        searchQuery = '';
        await loadLibraryInfo();
        await load();
      }
    } catch (e) {
      importError = String(e);
    } finally {
      openingLibrary = false;
    }
  }

  async function importFile() {
    importing = true;
    importError = null;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'EPUB', extensions: ['epub'] }],
      });
      if (typeof selected === 'string') {
        await invoke('import_book', { sourcePath: selected });
        await load();
      }
    } catch (e) {
      importError = String(e);
    } finally {
      importing = false;
    }
  }

  onMount(async () => {
    await loadLibraryInfo();
    await load();
  });
</script>

<div class="library">
  <div class="header">
    <h1>Библиотека</h1>
    <div class="header-actions">
      <button class="open-library-button" type="button" onclick={openLibrary} disabled={openingLibrary}>
        {openingLibrary ? 'Открытие...' : 'Открыть библиотеку'}
      </button>
      {#if libraryKind === 'portable'}
        <button class="import-button" type="button" onclick={importFile} disabled={importing}>
          {importing ? 'Импорт...' : 'Добавить EPUB'}
        </button>
      {/if}
    </div>
  </div>

  <label class="search">
    <span>Поиск</span>
    <input bind:value={searchQuery} oninput={updateSearch} placeholder="Название или автор" />
  </label>

  {#if importError}
    <p class="state error">{importError}</p>
  {/if}

  {#if loading}
    <p class="state">Загрузка...</p>
  {:else if error}
    <p class="state error">{error}</p>
  {:else if books.length === 0}
    <p class="state empty-state">
      Библиотека пуста. Добавьте EPUB-файлы в папку библиотеки.
    </p>
  {:else}
    <ul class="book-list">
      {#each books as book (book.id)}
        <li>
          <button
            class="book-card"
            type="button"
            onclick={() => openBook(book.id)}
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
  .import-button {
    padding: 8px 14px;
    border: 1px solid #333;
    border-radius: 6px;
    background: #333;
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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
  .import-button:hover:not(:disabled) {
    background: #000;
  }
  .import-button:disabled {
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
</style>
