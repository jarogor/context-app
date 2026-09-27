<script lang="ts">
  import { onMount } from 'svelte';
  import { BookCoverPlaceholder, Input } from '@texture/ui';
  import { invoke, listen, operation } from './bridge';
  import type { Book, BookFile } from './types';

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
  let librarySelected = $state(false);

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
      try {
        const value = (await operation('cover', { book_id: book.id })) as {
          data?: string | null;
          format?: string;
        };
        if (!value.data) {
          continue;
        }
        const mime =
          value.format === 'png'
            ? 'image/png'
            : value.format === 'webp'
              ? 'image/webp'
              : value.format === 'gif'
                ? 'image/gif'
                : 'image/jpeg';
        const coverUri = `data:${mime};base64,${value.data}`;
        books = books.map((current) =>
          current.id === book.id ? { ...current, coverUri } : current,
        );
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
      books = list;
      onBooksChange(list);
      void loadCovers(list);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  async function updateSearch() {
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

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen('source-catalog-changed', () => {
        librarySelected = true;
        searchQuery = '';
        void load();
      });
      // Компонент пересоздаётся при возврате из read-view — восстанавливаем активную библиотеку.
      const active = (await invoke<{ path?: string } | null>('active_library', {})) as {
        path?: string;
      } | null;
      if (active?.path) {
        librarySelected = true;
        await load();
      } else if (books.length === 0 && cachedBooks.length > 0) {
        books = cachedBooks;
        loading = false;
        void loadCovers(cachedBooks);
      }
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<div class="p-[var(--space-5)]">
  {#if librarySelected}
    <label
      class="mb-[var(--space-4)] flex flex-col gap-[var(--space-1)] text-[13px] text-[var(--color-text-muted)]"
    >
      <span>Поиск</span>
      <Input
        bind:value={searchQuery}
        oninput={updateSearch}
        placeholder="Название или автор"
        class="max-w-[420px]"
      />
    </label>
  {/if}

  {#if importError}
    <p class="text-[var(--color-danger)]">{importError}</p>
  {/if}

  {#if !librarySelected}
    <p class="text-[var(--color-text-muted)]">
      Библиотека не открыта. Откройте её на странице «Библиотеки».
    </p>
  {:else if loading && books.length === 0}
    <p class="text-[var(--color-text-muted)]">Загрузка…</p>
  {:else if error}
    <p class="text-[var(--color-danger)]">{error}</p>
  {:else if books.length === 0}
    <p class="text-[var(--color-text-muted)]">
      В библиотеке пока нет книг.
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
            onclick={() => openBook(book.id)}
          >
            {#if book.coverUri}
              <img class="aspect-[2/3] w-full rounded-[var(--radius-sm)] object-cover" src={book.coverUri} alt="" />
            {:else}
              <BookCoverPlaceholder />
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
