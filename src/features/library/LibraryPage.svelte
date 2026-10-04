<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { BookCoverPlaceholder, Button, Input } from '@texture/ui';
  import { listenEvent } from '../../shared/app-bridge';
  import {
    activeLibraryPath,
    listBooks,
    loadCover,
    openBookExternal,
    readerFormats,
    type Book,
    type BookWithCover,
  } from './library';
  import type { ActiveLibrary } from '../lifecycle/bootstrap';

  interface Props {
    /** Активная библиотека, загруженная до первого рендера. */
    initialActiveLibrary: ActiveLibrary | null;
    /** Имя рабочего места, в которое попадёт книга; null — место ещё не выбрано. */
    targetWorkspaceName?: string | null;
    /** Открытие книги вкладкой рабочего места. */
    onOpenInWorkplace: (book: { path: string; title: string; format: string }) => void;
  }

  let { initialActiveLibrary, targetWorkspaceName = null, onOpenInWorkplace }: Props = $props();

  /** Открыта ли библиотека (есть активный корень). */
  let librarySelected = $state(untrack(() => initialActiveLibrary?.path != null));

  /** Книги библиотеки с обложками. */
  let books: BookWithCover[] = $state([]);

  /** Идёт ли загрузка каталога. */
  let loading = $state(false);

  /** Ошибка загрузки каталога. */
  let error: string | null = $state(null);

  /** Строка поиска по названию и авторам. */
  let searchQuery = $state('');

  /** Книга, для которой открыта страница (или `null` — список). */
  let openedBook: BookWithCover | null = $state(null);

  /** Форматы, поддерживаемые встроенным чтением. */
  let supportedFormats: string[] = $state(['epub']);

  /** Корень активной библиотеки для сборки абсолютного пути книги. */
  let libraryRoot = $state('');

  /** Загрузка каталога активной библиотеки. */
  async function load() {
    if (!librarySelected) {
      loading = false;
      books = [];
      return;
    }
    loading = true;
    error = null;
    try {
      const list = await listBooks(searchQuery);
      books = list;
      void loadCovers(list);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  /** Последовательная загрузка обложек, не блокирующая каталог. */
  async function loadCovers(list: Book[]) {
    for (const book of list) {
      try {
        const coverUri = await loadCover(book.id);
        if (coverUri) {
          books = books.map((current) =>
            current.id === book.id ? { ...current, coverUri } : current,
          );
        }
      } catch {
        // Отсутствие обложки не должно блокировать каталог.
      }
    }
  }

  /** Открытие библиотеки снаружи: обновление корня и перезагрузка каталога.
   *
   * Корень берётся из события, а не только из разового чтения при монтировании:
   * библиотека может быть открыта уже после первого кадра, и без обновления
   * абсолютный путь книги собирался бы от пустого корня.
   */
  async function onCatalogChanged(value?: unknown) {
    const payload = value as ActiveLibrary | null;
    if (payload?.path) {
      libraryRoot = payload.path;
    } else {
      try {
        libraryRoot = await activeLibraryPath();
      } catch {
        libraryRoot = '';
      }
    }
    librarySelected = true;
    searchQuery = '';
    openedBook = null;
    await load();
  }

  /** Открытие страницы книги по клику на карточку. */
  function openBook(book: BookWithCover) {
    openedBook = book;
  }

  /** Возврат к списку книг с сохранённым поиском. */
  function closeBook() {
    openedBook = null;
  }

  /** Формат файла содержимого книги. */
  function bookFormat(book: Book): string {
    return book.files.find((file) => file.kind === 'book')?.format?.toLowerCase() ?? '';
  }

  /** Абсолютный путь файла содержимого книги (вложение вкладки). */
  function bookPath(book: Book): string {
    const relative = book.files.find((file) => file.kind === 'book')?.path ?? '';
    if (!relative) {
      return '';
    }
    if (/^([a-z]+:)?[\\/]/i.test(relative)) {
      return relative;
    }
    if (!libraryRoot) {
      return relative;
    }
    return `${libraryRoot.replace(/[\\/]+$/, '')}/${relative}`;
  }

  /** Поддерживает ли книгу встроенное чтение или плагин рабочего места. */
  function canRead(book: Book): boolean {
    return supportedFormats.includes(bookFormat(book));
  }

  /** Открытие книги вкладкой рабочего места. */
  function startReading(book: BookWithCover) {
    onOpenInWorkplace({ path: bookPath(book), title: book.title, format: bookFormat(book) });
  }

  /** Ошибка открытия во внешнем приложении. */
  let externalError: string | null = $state(null);

  /** Идёт открытие во внешнем приложении. */
  let opening = $state(false);

  /** Открытие файла книги в системном приложении. */
  async function openInSystem(book: BookWithCover) {
    externalError = null;
    opening = true;
    try {
      await openBookExternal(book.id);
    } catch (e) {
      externalError = String(e);
    } finally {
      opening = false;
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('source-catalog-changed', (value) => {
        void onCatalogChanged(value);
      });
      try {
        const formats = await readerFormats();
        supportedFormats = [...new Set(['epub', ...formats.map((value) => value.toLowerCase())])];
      } catch {
        supportedFormats = ['epub'];
      }
      try {
        libraryRoot = await activeLibraryPath();
      } catch {
        libraryRoot = '';
      }
      if (librarySelected) {
        await load();
      }
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

{#if openedBook}
  <div class="mx-auto max-w-[760px] p-6" data-testid="book-page">
    <Button variant="ghost" size="sm" class="mb-4" onclick={closeBook}>
      ← К списку
    </Button>

    <div class="flex flex-col gap-6 sm:flex-row">
      <div class="w-[180px] flex-none">
        {#if openedBook.coverUri}
          <img
            class="aspect-[2/3] w-full rounded-md object-cover"
            src={openedBook.coverUri}
            alt=""
          />
        {:else}
          <BookCoverPlaceholder />
        {/if}
      </div>

      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-semibold" data-testid="book-title">{openedBook.title}</h1>
        {#if openedBook.authors.length > 0}
          <p class="mt-1 text-[var(--muted-foreground)]">
            {openedBook.authors.map((author) => author.name).join(', ')}
          </p>
        {/if}

        {#if openedBook.series.length > 0}
          <p class="mt-2 text-[13px] text-[var(--muted-foreground)]">
            Серия: {openedBook.series.map((entry) => entry.series.name).join(', ')}
          </p>
        {/if}

        {#if openedBook.tags.length > 0}
          <p class="mt-1 text-[13px] text-[var(--muted-foreground)]">
            Теги: {openedBook.tags.map((tag) => tag.name).join(', ')}
          </p>
        {/if}

        <div class="mt-6 flex flex-wrap items-center gap-2">
          {#if canRead(openedBook)}
            <Button variant="primary" onclick={() => startReading(openedBook as BookWithCover)}>
              {targetWorkspaceName
                ? `Добавить в «${targetWorkspaceName}»`
                : 'Добавить в рабочее место'}
            </Button>
          {/if}
          <Button variant="secondary" disabled={opening} onclick={() => openInSystem(openedBook as BookWithCover)}>
            {opening ? 'Открытие…' : 'Открыть'}
          </Button>
        </div>

        {#if externalError}
          <p class="mt-3 text-[var(--destructive)]">{externalError}</p>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <div class="p-6">
    {#if librarySelected}
      <label
        class="mb-4 flex flex-col gap-1 text-[13px] text-[var(--muted-foreground)]"
      >
        <span>Поиск</span>
        <Input
          bind:value={searchQuery}
          oninput={load}
          placeholder="Название или автор"
          class="max-w-[420px]"
        />
      </label>
    {/if}

    {#if !librarySelected}
      <p class="text-[var(--muted-foreground)]">
        Библиотека не открыта. Откройте её на странице «Библиотеки».
      </p>
    {:else if loading && books.length === 0}
      <p class="text-[var(--muted-foreground)]">Загрузка…</p>
    {:else if error}
      <p class="text-[var(--destructive)]">{error}</p>
    {:else if books.length === 0}
      <p class="text-[var(--muted-foreground)]">В библиотеке пока нет книг.</p>
    {:else}
      <ul
        class="grid list-none gap-6 p-0 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]"
      >
        {#each books as book (book.id)}
          <li>
            <button
              class="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-left [font:inherit] hover:shadow-sm"
              type="button"
              title="Страница книги"
              onclick={() => openBook(book)}
            >
              {#if book.coverUri}
                <img
                  class="aspect-[2/3] w-full rounded-sm object-cover"
                  src={book.coverUri}
                  alt=""
                />
              {:else}
                <BookCoverPlaceholder />
              {/if}
              <div>
                <h2 class="text-[15px] font-semibold">{book.title}</h2>
                <p class="mt-1 text-[13px] text-[var(--muted-foreground)]">
                  {book.authors.map((author) => author.name).join(', ')}
                </p>
              </div>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
