<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  interface Props {
    bookId: number;
    onNavigate: (page: string, bookId?: number) => void;
  }

  interface BookContent {
    title: string;
    authors: string[];
    text: string;
  }

  let { bookId, onNavigate }: Props = $props();

  let content: BookContent | null = $state(null);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);

  onMount(async () => {
    try {
      content = (await invoke('get_book_content', { bookId })) as BookContent;
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
</style>