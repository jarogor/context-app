<script lang="ts">
  import { onMount } from 'svelte';
  import { Badge, Input } from '@texture/ui';
  import { listen, operation } from './bridge';
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
  let sourceName: string | null = $state(null);
  let libraryPath: string | null = $state(null);
  let librarySelected = $state(false);

  function coverFile(book: Book): BookFile | undefined {
    return book.files.find((file) => file.kind === 'cover');
  }

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
      if (!coverFile(book)) {
        continue;
      }
      try {
        const value = (await operation('cover', { book_id: book.id })) as { data?: string; format?: string };
        const mime = value.format === 'png' ? 'image/png' : value.format === 'webp' ? 'image/webp' : 'image/jpeg';
        const coverUri = value.data ? `data:${mime};base64,${value.data}` : null;
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

  /** Название библиотеки по последнему сегменту пути. */
  function libraryName(): string {
    if (!libraryPath) {
      return 'Библиотека';
    }
    return libraryPath.split('/').filter(Boolean).pop() ?? libraryPath;
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen<{ path?: string; provider_name?: string }>(
        'source-catalog-changed',
        (value) => {
          librarySelected = true;
          sourceName = value?.provider_name ?? sourceName;
          libraryPath = value?.path ?? libraryPath;
          searchQuery = '';
          void load();
        },
      );
      if (!librarySelected && books.length === 0 && cachedBooks.length > 0) {
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
    <div class="mb-[var(--space-4)] flex items-center gap-[var(--space-2)]">
      {#if sourceName}
        <Badge>{sourceName}</Badge>
      {/if}
      <strong class="text-base">{libraryName()}</strong>
    </div>

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
      Источник не содержит книг, найденных сканером.
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
              <div
                class="aspect-[2/3] w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]"
                aria-hidden="true"
              ></div>
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
