<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    BookCoverPlaceholder,
    Button,
    EmptyState,
    ErrorState,
    Icon,
    Input,
    ScrollArea,
    Select,
    Skeleton,
  } from '@texture/ui';
  import BookPage from './BookPage.svelte';
  import { listenEvent } from '../../shared/app-bridge';
  import {
    activeLibraryPath,
    listBooks,
    loadCover,
    openBookExternal,
    readerFormats,
    type Book,
    type BookFile,
    type BookWithCover,
  } from './library';
  import type { ActiveLibrary } from '../lifecycle/bootstrap';

  interface Props {
    /** Активная библиотека, загруженная до первого рендера. */
    initialActiveLibrary: ActiveLibrary | null;
    /** Показывается ли область библиотеки (форматы читалки нужны только тогда). */
    visible?: boolean;
    /** Имя рабочего места, в которое попадёт книга; null — место ещё не выбрано. */
    targetWorkspaceName?: string | null;
    /** Открытие книги вкладкой рабочего места. */
    onOpenInWorkplace: (book: { path: string; title: string; format: string }) => void;
  }

  let {
    initialActiveLibrary,
    visible = true,
    targetWorkspaceName = null,
    onOpenInWorkplace,
  }: Props = $props();

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

  /** Запрошены ли форматы чтения; повторный запрос не выполняется. */
  let formatsLoaded = $state(false);

  /** Корень активной библиотеки для сборки абсолютного пути книги. */
  let libraryRoot = $state('');

  /** Корень, для которого уже загружен каталог: повторный выбор не перечитывает. */
  let libraryRootUsed = $state('');

  /** Режим показа книг: плитка или список. */
  let viewMode = $state<'grid' | 'list'>('grid');

  /** Порядок книг: по названию, автору или времени добавления. */
  let sortMode = $state<'title' | 'author' | 'added'>('title');

  /** Фильтр по наличию обложки: все книги или только без обложки. */
  let coverFilter = $state<'all' | 'without-cover'>('all');

  /** Варианты порядка книг. */
  const sortOptions = [
    { value: 'title', label: 'По названию' },
    { value: 'author', label: 'По автору' },
    { value: 'added', label: 'По порядку' },
  ];

  /** Варианты фильтра по обложке. */
  const coverOptions = [
    { value: 'all', label: 'Все книги' },
    { value: 'without-cover', label: 'Без обложки' },
  ];

  /** Имена авторов книги строкой. */
  function authorNames(book: Book): string {
    return book.authors.map((author) => author.name).join(', ');
  }

  /** Книги с учётом фильтра обложки и выбранного порядка. */
  const viewBooks = $derived.by(() => {
    let list = books;
    if (coverFilter === 'without-cover') {
      list = list.filter((book) => !book.coverUri);
    }
    const sorted = [...list];
    if (sortMode === 'author') {
      sorted.sort((a, b) => authorNames(a).localeCompare(authorNames(b), 'ru'));
    } else if (sortMode === 'title') {
      sorted.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    }
    return sorted;
  });

  /** Выбор режима показа. */
  function chooseViewMode(mode: 'grid' | 'list') {
    viewMode = mode;
    rememberViewMode(mode);
  }

  /** Запоминание режима показа в браузере. */
  function rememberViewMode(mode: 'grid' | 'list') {
    try {
      localStorage.setItem('library-view-mode', mode);
    } catch {
      /* Хранилище недоступно — режим остаётся в состоянии страницы. */
    }
  }

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

  /** Загрузка форматов, поддерживаемых чтением.
   *
   * Форматы требуют плагинов чтения, которые не нужны первому кадру, поэтому
   * запрос выполняется при показе области библиотеки или открытии книги, а
   * не при запуске приложения. Повторный вызов использует уже полученный
   * результат и не загружает плагины чтения дважды.
   */
  async function ensureFormats() {
    if (formatsLoaded) {
      return;
    }
    formatsLoaded = true;
    try {
      const formats = await readerFormats();
      supportedFormats = [...new Set(['epub', ...formats.map((value) => value.toLowerCase())])];
    } catch {
      supportedFormats = ['epub'];
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
    const nextRoot = payload?.path ?? '';
    if (payload?.path) {
      libraryRoot = payload.path;
    } else {
      try {
        libraryRoot = await activeLibraryPath();
      } catch {
        libraryRoot = '';
      }
    }
    // Та же библиотека уже загружена: не перечитываем каталог и обложки заново.
    // Библиотека перечитывается только при смене корня.
    if (librarySelected && nextRoot !== '' && nextRoot === libraryRootUsed && books.length > 0) {
      return;
    }
    libraryRootUsed = libraryRoot;
    librarySelected = true;
    searchQuery = '';
    clearTimeout(searchTimer);
    openedBook = null;
    void ensureFormats();
    await load();
  }

  /** Открытие страницы книги по клику на карточку. */
  function openBook(book: BookWithCover) {
    void ensureFormats();
    openedBook = book;
  }

  /** Возврат к списку книг с сохранённым поиском. */
  function closeBook() {
    openedBook = null;
  }

  /** Сброс открытой книги при уходе из раздела библиотеки. */
  export function resetBook() {
    openedBook = null;
  }

  /** Форматы файлов-содержимого книги: формат и поддерживается ли чтением. */
  function bookFormats(book: Book): { format: string; readable: boolean }[] {
    return book.files
      .filter((file) => file.kind === 'book')
      .map((file) => {
        const format = file.format.toLowerCase();
        return { format, readable: supportedFormats.includes(format) };
      });
  }

  /** Формат файла содержимого книги, который откроется чтением (или первый). */
  function bookFormat(book: Book): string {
    const formats = bookFormats(book);
    return (formats.find((entry) => entry.readable) ?? formats[0])?.format ?? '';
  }

  /** Поддерживает ли книгу чтение хотя бы в одном формате. */
  function canRead(book: Book): boolean {
    return bookFormats(book).some((entry) => entry.readable);
  }

  /** Файл содержимого книги заданного формата (или читаемого по умолчанию). */
  function bookFile(book: Book, format?: string): BookFile | undefined {
    const target = format || bookFormat(book);
    return (
      book.files.find(
        (file) => file.kind === 'book' && file.format.toLowerCase() === target,
      ) ?? book.files.find((file) => file.kind === 'book')
    );
  }

  /** Абсолютный путь файла содержимого книги (вложение вкладки). */
  function bookPath(book: Book, format?: string): string {
    const relative = bookFile(book, format)?.path ?? '';
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

  /** Открытие книги вкладкой рабочего места. */
  function startReading(book: BookWithCover, format?: string) {
    onOpenInWorkplace({
      path: bookPath(book, format),
      title: book.title,
      format: format || bookFormat(book),
    });
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
    try {
      const stored = localStorage.getItem('library-view-mode');
      if (stored === 'grid' || stored === 'list') {
        viewMode = stored;
      }
    } catch {
      /* Хранилище недоступно — режим по умолчанию остаётся. */
    }
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('source-catalog-changed', (value) => {
        void onCatalogChanged(value);
      });
      try {
        libraryRoot = await activeLibraryPath();
      } catch {
        libraryRoot = '';
      }
      if (librarySelected) {
        void ensureFormats();
        await load();
      }
    })();
    return () => {
      clearTimeout(searchTimer);
      unlisten?.();
    };
  });

  // Форматы запрашиваются, когда область библиотеки становится видимой:
  // при старте страница скрыта за рабочим местом и плагины чтения не нужны.
  $effect(() => {
    if (visible) {
      void ensureFormats();
    }
  });
</script>

{#if openedBook}
  <BookPage
    book={openedBook}
    {targetWorkspaceName}
    formats={bookFormats(openedBook)}
    canRead={canRead(openedBook)}
    {opening}
    {externalError}
    onClose={closeBook}
    onAdd={(format) => startReading(openedBook as BookWithCover, format)}
    onOpenExternal={() => openInSystem(openedBook as BookWithCover)}
  />
{:else}
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    {#if librarySelected}
      <!--
        Полоса управления каталогом: поиск с лупой и справа — порядок, фильтр и
        режим показа. Идёт отдельной строкой под панелью раздела и не
        прокручивается вместе со списком.
      -->
      <div
        class="flex flex-none flex-col gap-2 border-b border-[var(--border)] bg-[var(--surface-inset)] px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center md:px-6"
        data-testid="library-controls"
      >
        <Input
          bind:value={searchQuery}
          placeholder="Название или автор"
          ariaLabel="Название или автор"
          icon="search"
          clearable
          class="w-full sm:w-auto sm:max-w-[24rem] sm:flex-1"
          oninput={onSearchInput}
        />
        <div class="flex flex-wrap items-center gap-2 sm:ml-auto">
          <span class="mr-auto role-caption text-[var(--muted-foreground)] sm:mr-0">
            {viewBooks.length} из {books.length}
          </span>
          <Select
            bind:value={sortMode}
            items={sortOptions}
            ariaLabel="Порядок книг"
            size="sm"
            class="w-[9.5rem]"
          />
          <Select
            bind:value={coverFilter}
            items={coverOptions}
            ariaLabel="Фильтр книг"
            size="sm"
            class="w-[9.5rem]"
          />
          <div
            class="flex flex-none items-center gap-0.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-0.5"
            role="group"
            aria-label="Режим показа"
          >
            <Button
              variant={viewMode === 'grid' ? 'primary' : 'ghost'}
              size="icon"
              title="Плитка"
              ariaLabel="Плитка"
              ariaPressed={viewMode === 'grid'}
              onclick={() => chooseViewMode('grid')}
            >
              <Icon name="grid" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'primary' : 'ghost'}
              size="icon"
              title="Список"
              ariaLabel="Список"
              ariaPressed={viewMode === 'list'}
              onclick={() => chooseViewMode('list')}
            >
              <Icon name="list" />
            </Button>
          </div>
        </div>
      </div>
    {/if}

    <ScrollArea testId="library-page" class="p-4 md:p-6">
      {#if !librarySelected}
        <EmptyState
          icon="library"
          title="Библиотека не открыта"
          description="Откройте директорию с книгами в разделе «Библиотеки»."
          testId="library-not-selected"
        />
      {:else if loading && books.length === 0}
        <Skeleton rows={3} rowClass="h-[16rem]" />
      {:else if error}
        <ErrorState message={error} testId="library-error" />
      {:else if books.length === 0}
        <EmptyState
          icon="book"
          title="В библиотеке пока нет книг"
          description="Добавьте книги в папку библиотеки, и они появятся здесь."
          testId="library-empty"
        />
      {:else if viewBooks.length === 0}
        <EmptyState
          icon="book"
          title="Книг по фильтру нет"
          description="Измените фильтр, чтобы увидеть книги."
          testId="library-filtered-empty"
        />
      {:else if viewMode === 'grid'}
        <ul
          class="grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fill,minmax(8rem,1fr))] md:gap-6 md:[grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]"
          data-testid="library-grid"
        >
          {#each viewBooks as book (book.id)}
            <li>
              <button
                class="group flex w-full cursor-pointer flex-col gap-2 rounded-[var(--radius)] p-2 text-left transition-colors [font:inherit] hover:bg-[var(--surface-hover)]"
                type="button"
                title="Страница книги"
                onclick={() => openBook(book)}
              >
                <span
                  class="block overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]"
                >
                  {#if book.coverUri}
                    <img
                      class="aspect-[2/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      src={book.coverUri}
                      alt=""
                    />
                  {:else}
                    <BookCoverPlaceholder />
                  {/if}
                </span>
                <div class="min-w-0">
                  <h2 class="line-clamp-2 role-subtitle" title={book.title}>{book.title}</h2>
                  <p class="mt-1 truncate role-caption text-[var(--muted-foreground)]">
                    {authorNames(book)}
                  </p>
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <ul
          class="m-0 flex list-none flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-0"
          data-testid="library-list"
        >
          {#each viewBooks as book (book.id)}
            <li class="border-b border-[var(--divider)] last:border-b-0">
              <button
                class="flex w-full cursor-pointer items-center gap-3 p-2 text-left transition-colors [font:inherit] hover:bg-[var(--surface-hover)]"
                type="button"
                title="Страница книги"
                onclick={() => openBook(book)}
              >
                <span class="block h-[4.5rem] w-[3rem] shrink-0 overflow-hidden rounded-sm">
                  {#if book.coverUri}
                    <img class="h-full w-full object-cover" src={book.coverUri} alt="" />
                  {:else}
                    <BookCoverPlaceholder class="h-full" />
                  {/if}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate role-title">{book.title}</span>
                  <span class="mt-0.5 block truncate role-caption text-[var(--muted-foreground)]">
                    {authorNames(book)}
                  </span>
                </span>
                <Icon name="chevron-right" class="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </ScrollArea>
  </div>
{/if}
