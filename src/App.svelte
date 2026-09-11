<script lang="ts">
  import Library from './pages/Library.svelte';
  import Reading from './pages/Reading.svelte';

  let currentPage: string = $state('library');
  let currentBookId: number = $state(0);

  function navigate(page: string, bookId?: number) {
    currentPage = page;
    if (bookId !== undefined) {
      currentBookId = bookId;
    }
  }
</script>

{#if currentPage === 'library'}
  <Library onNavigate={navigate} />
{:else if currentPage === 'reading'}
  <Reading bookId={currentBookId} onNavigate={navigate} />
{/if}