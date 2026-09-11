<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import type { Book, BookFile } from '../types';

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

  function coverFile(book: Book): BookFile | undefined {
    return book.files.find((f) => f.kind === 'cover');
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const list: Book[] = await invoke('list_books');
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

  onMount(load);
</script>

<div class="library">
  <div class="header">
    <h1>Библиотека</h1>
    <button class="import-button" type="button" onclick={importFile} disabled={importing}>
      {importing ? 'Импорт...' : 'Добавить EPUB'}
    </button>
  </div>

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
            onclick={() => onNavigate('reading', book.id)}
          >
            {#if book.coverUri}
              <img class="cover" src={book.coverUri} alt="" />
            {:else}
              <div class="cover cover-placeholder" aria-hidden="true"></div>
            {/if}
            <div class="book-info">
              <h2>{book.title}</h2>
              <p class="authors">{book.authors.map((a) => a.name).join(', ')}</p>
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
  .import-button:hover:not(:disabled) {
    background: #000;
  }
  .import-button:disabled {
    opacity: 0.6;
    cursor: default;
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
</style>