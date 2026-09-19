<script lang="ts">
  import Library from './Library.svelte';
  import Reading from './Reading.svelte';
  import type { Book } from './types';

  let page: 'library' | 'reading' = $state('library');
  let bookId: number | string = $state('');
  let cachedBooks: Book[] = $state([]);

  function navigate(nextPage: string, nextBookId?: number | string) {
    page = nextPage === 'reading' ? 'reading' : 'library';
    if (nextBookId !== undefined) {
      bookId = nextBookId;
    }
  }
</script>

{#if page === 'library'}
  <Library
    onNavigate={navigate}
    books={cachedBooks}
    onBooksChange={(books: Book[]) => (cachedBooks = books)}
  />
{:else}
  <Reading bookId={bookId} onNavigate={navigate} />
{/if}
