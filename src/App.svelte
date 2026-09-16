<script lang="ts">
  import Library from './pages/Library.svelte';
  import Reading from './pages/Reading.svelte';
  import type { Book } from './types';

  let currentPage: string = $state('library');
  let currentBookId: number = $state(0);
  let cachedBooks: Book[] = $state([]);

  function navigate(page: string, bookId?: number) {
    currentPage = page;
    if (bookId !== undefined) {
      currentBookId = bookId;
    }
  }
</script>

{#if currentPage === 'library'}
   <Library onNavigate={navigate} books={cachedBooks} onBooksChange={(books) => (cachedBooks = books)} />
{:else if currentPage === 'reading'}
  <Reading bookId={currentBookId} onNavigate={navigate} />
{/if}
