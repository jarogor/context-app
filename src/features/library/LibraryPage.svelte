<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { BookCoverPlaceholder, SearchCreate, SurfaceScroll } from '@texture/ui';
  import BookPage from './BookPage.svelte';
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

  /** Задержка перед серверным поиском, чтобы не слать вызов на каждый символ. */
  const SEARCH_DEBOUNCE_MS = 300;

  /** Таймер отложенного поиска. */
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  /** Отложенный поиск при вводе, отменяющий предыдущий таймер. */
  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void load();
    }, SEARCH_DEBOUNCE_MS);
  }

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

  /** Параллельная загрузка обложек с однократным применением к списку по id. */
  async function loadCovers(list: Book[]) {
    const results = await Promise.all(
      list.map(async (book) => {
        try {
          return { id: book.id, coverUri: await loadCover(book.id) };
        } catch {
          // Отсутствие обложки не должно блокировать каталог.
          return { id: book.id, coverUri: null };
        }
      }),
    );
    const covers = new Map(
      results
        .filter((entry): entry is { id: string; coverUri: string } => entry.coverUri !== null)
        .map((entry) => [entry.id, entry.coverUri]),
    );
    if (covers.size === 0) {
      return;
    }
    books = books.map((current) => {
      const coverUri = covers.get(current.id);
      return coverUri ? { ...current, coverUri } : current;
    });
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
    clearTimeout(searchTimer);
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
      clearTimeout(searchTimer);
      unlisten?.();
    };
  });
</script>

{#if openedBook}
  <SurfaceScroll testId="book-page-scroll">
    <BookPage
      book={openedBook}
      {targetWorkspaceName}
      canRead={canRead(openedBook)}
      {opening}
      {externalError}
      onClose={closeBook}
      onAdd={() => startReading(openedBook as BookWithCover)}
      onOpenExternal={() => openInSystem(openedBook as BookWithCover)}
    />
  </SurfaceScroll>
{:else}
  <SurfaceScroll testId="library-page" class="p-6">
    {#if librarySelected}
      <SearchCreate
        bind:query={searchQuery}
        searchPlaceholder="Название или автор"
        class="mb-4 max-w-[420px]"
        onSearch={onSearchInput}
      />
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
  </SurfaceScroll>
{/if}
