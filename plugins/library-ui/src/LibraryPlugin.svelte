<script lang="ts">
  import Library from './Library.svelte';
  import BookPage from './BookPage.svelte';
  import type { Book } from './types';

  type BookWithCover = Book & { coverUri?: string };

  let cachedBooks: Book[] = $state([]);
  let openedBook: BookWithCover | null = $state(null);

  /** Открытие страницы книги. */
  function openBook(book: Book) {
    openedBook = book;
  }

  /** Возврат к списку книг. */
  function closeBook() {
    openedBook = null;
  }
</script>

<div class:hidden={openedBook !== null}>
  <Library
    books={cachedBooks}
    onBooksChange={(books) => (cachedBooks = books)}
    onOpenBook={openBook}
  />
</div>

{#if openedBook}
  <BookPage book={openedBook} onBack={closeBook} />
{/if}
