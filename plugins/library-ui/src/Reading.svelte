<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  interface Props {
    bookId: number | string;
    onNavigate: (page: string, bookId?: number | string) => void;
  }

  interface BookContent {
    title: string;
    authors: string[];
    text: string;
  }

  let { bookId, onNavigate }: Props = $props();

  let content: BookContent | null = $state(null);
  let externalBook: { title: string; authors: { name: string }[] } | null = $state(null);
  let libraryKind: string = $state('portable');
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let opening: boolean = $state(false);

  async function openInSystem() {
    opening = true;
    error = null;
    try {
      await invoke('open_book_in_system', { bookId });
    } catch (e) {
      error = `Не удалось открыть файл: ${String(e)}`;
    } finally {
      opening = false;
    }
  }

  onMount(async () => {
    try {
      const info = (await invoke('get_library_info')) as { kind: string };
      libraryKind = info.kind;
      if (libraryKind === 'external') {
        const books = await (invoke('list_books') as Promise<
          Array<{ id: number | string; title: string; authors: { name: string }[] }>
        >);
        externalBook = books.find((book) => book.id === bookId) ?? null;
        if (!externalBook) {
          throw new Error('Книга не найдена');
        }
      } else {
        content = (await invoke('get_book_content', { bookId })) as BookContent;
      }
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="reading">
  <button class="back-btn" onclick={() => onNavigate('library')}>
    ← К списку
  </button>

  {#if loading}
    <p class="state">Загрузка...</p>
  {:else if error}
    <div class="error-block">
      <p class="state error">Не удалось загрузить книгу: {error}</p>
      <button class="back-btn" onclick={() => onNavigate('library')}>
        ← Список книг
      </button>
    </div>
  {:else if libraryKind === 'external' && externalBook}
    <header>
      <h1>{externalBook.title}</h1>
      <p class="authors">{externalBook.authors.map((author) => author.name).join(', ')}</p>
    </header>
    <button class="open-btn" onclick={openInSystem} disabled={opening}>
      {opening ? 'Открытие...' : 'Открыть в системе'}
    </button>
  {:else if content}
    <header>
      <h1>{content.title}</h1>
      <p class="authors">{content.authors.join(', ')}</p>
    </header>
    <div class="text">{content.text}</div>
  {/if}
</div>

<style>
  .reading {
    padding: 24px;
    max-width: 760px;
    margin: 0 auto;
  }
  .back-btn {
    margin-bottom: 16px;
    cursor: pointer;
    background: none;
    border: none;
    color: #5a8fda;
    font-size: 14px;
  }
  .back-btn:hover {
    text-decoration: underline;
  }
  .state {
    color: #888;
  }
  .error {
    color: #c0392b;
  }
  header h1 {
    margin: 0;
  }
  .authors {
    color: #666;
    margin: 4px 0 16px;
  }
  .text {
    white-space: pre-wrap;
    line-height: 1.5;
    text-align: justify;
  }
  .open-btn {
    padding: 8px 14px;
    border: 1px solid #333;
    border-radius: 6px;
    background: #333;
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
</style>
