<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    BookCover,
    Button,
    Checkbox,
    Dialog,
    EmptyState,
    ErrorState,
    Icon,
    Input,
    ScrollArea,
    Select,
    Skeleton,
  } from '@context/ui';
  import BookPage from './BookPage.svelte';
  import {
    applyBookProperties,
    loadBookProperties,
    saveBookProperties,
    type BookPropertyEntry,
    type BookPropertyMap,
  } from './book-properties';
  import { currentLocale, t } from '@context/i18n';
  import { listenEvent } from '../../shared/app-bridge';
  import {
    activeFilterCount,
    bookFacets,
    emptyFilters,
    FACET_IDS,
    FACET_LABELS,
    filterBooks,
    sortBooks,
    SORT_FIELDS,
    sortField as sortFieldInfo,
    toggleFacet,
    type BookFilters,
    type FacetId,
    type SortDirection,
    type SortField,
  } from './fields';
  import {
    absoluteBookPath,
    activeLibraryPath,
    LIBRARY_PAGE_SIZE,
    listBooks,
    loadCover,
    openBookFile,
    openBookFolder,
    readerFormats,
    type Book,
    type BookFile,
    type BookFormatInfo,
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

  /** Пользовательские правки и теги книг по абсолютному пути. */
  let properties: BookPropertyMap = $state({});

  /** Идёт ли загрузка каталога. */
  let loading = $state(false);

  /** Ошибка загрузки каталога. */
  let error: string | null = $state(null);

  /** Строка поиска по названию и авторам. */
  let searchQuery = $state('');

  /** Книга, для которой открыта страница (или `null` — список). */
  let openedBook: BookWithCover | null = $state(null);

  /** Форматы, поддерживаемые встроенным чтением. */
  let supportedFormats: string[] = $state<string[]>([]);

  /** Запрошены ли форматы чтения; повторный запрос не выполняется. */
  let formatsLoaded = $state(false);

  /** Корень активной библиотеки для сборки абсолютного пути книги. */
  let libraryRoot = $state('');

  /** Корень, для которого уже загружен каталог: повторный выбор не перечитывает. */
  let libraryRootUsed = $state('');

  /** Режим показа книг: плитка или список. */
  let viewMode = $state<'grid' | 'list'>('grid');

  /** Поле сортировки списка книг. */
  let sortField = $state<SortField>('title');

  /** Направление сортировки. */
  let sortDirection = $state<SortDirection>('asc');

  /** Выбранные значения фасетов. */
  let filters = $state<BookFilters>(emptyFilters());

  /** Открыта ли панель фильтров. */
  let filtersOpen = $state(false);

  /** Фильтр по наличию обложки: все книги или только без обложки. */
  let coverFilter = $state<'all' | 'without-cover'>('all');

  /** Номер показанной страницы списка (с единицы). */
  let page = $state(1);

  /** Элемент начала списка: после смены страницы список возвращается наверх. */
  let listTop: HTMLElement | null = $state(null);

  /** Варианты порядка книг. */
  const sortOptions = $derived(SORT_FIELDS.map((field) => ({ value: field.id, label: t(field.labelKey) })));

  /** Варианты фильтра по обложке. */
  const coverOptions = $derived([
    { value: 'all', label: t('app.library.filter.all') },
    { value: 'without-cover', label: t('app.library.filter.withoutCover') },
  ]);

  /** Имена авторов книги строкой. */
  function authorNames(book: Book): string {
    return book.authors.map((author) => author.name).join(', ');
  }

  /** Каталог с наложенными правками: правка перекрывает источник. */
  const mergedBooks = $derived(applyBookProperties(books, properties, bookPath));

  /** Значения фасетов фильтра по всему каталогу. */
  const facets = $derived(bookFacets(mergedBooks, currentLocale()));

  /** Число активных фасетов для счётчика на кнопке фильтров. */
  const filterCount = $derived(activeFilterCount(filters));

  /** Есть ли по каталогу хоть одно значение для фильтра. */
  const hasFacets = $derived(FACET_IDS.some((id) => facets[id].length > 0));

  /** Книги с учётом фильтров, фильтра обложки и выбранного порядка. */
  const viewBooks = $derived.by(() => {
    let list = filterBooks(mergedBooks, filters);
    if (coverFilter === 'without-cover') {
      list = list.filter((book) => !book.coverUri);
    }
    return sortBooks(list, sortField, sortDirection, currentLocale());
  });

  /** Число страниц списка (не меньше одной). */
  const totalPages = $derived(Math.max(1, Math.ceil(viewBooks.length / LIBRARY_PAGE_SIZE)));

  /** Номер страницы в границах списка: фильтр может сократить число страниц. */
  const currentPage = $derived(Math.min(page, totalPages));

  /** Книги текущей страницы. */
  const pageBooks = $derived(
    viewBooks.slice((currentPage - 1) * LIBRARY_PAGE_SIZE, currentPage * LIBRARY_PAGE_SIZE),
  );

  /** Номера страниц для перехода: при длинном списке — крайние и окно у текущей. */
  const pageItems = $derived.by((): (number | 'gap')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const items: (number | 'gap')[] = [];
    for (let number = 1; number <= totalPages; number += 1) {
      const edge = number === 1 || number === totalPages;
      const near = Math.abs(number - currentPage) <= 1;
      if (!edge && !near) {
        if (items[items.length - 1] !== 'gap') {
          items.push('gap');
        }
        continue;
      }
      items.push(number);
    }
    return items;
  });

  /** Переход на страницу списка с возвратом прокрутки к началу списка. */
  function goToPage(next: number) {
    const target = Math.min(Math.max(1, next), totalPages);
    if (target === currentPage) {
      return;
    }
    page = target;
    // Прокрутка возвращается к началу: иначе следующая страница открывается
    // с середины, где стоял пользователь.
    listTop?.scrollIntoView?.({ block: 'start' });
  }

  /** Смена поля сортировки: направление по умолчанию задаёт само поле. */
  function chooseSort(value: string) {
    sortField = value as SortField;
    sortDirection = sortFieldInfo(sortField).defaultDirection;
    page = 1;
  }

  /** Переключение направления сортировки. */
  function toggleDirection() {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  }

  /** Переключение значения фасета: список начинается с начала. */
  function onFacetToggle(id: FacetId, value: string) {
    filters = toggleFacet(filters, id, value);
    page = 1;
  }

  /** Сброс фильтров панели и фильтра по обложке. */
  function resetFilters() {
    filters = emptyFilters();
    coverFilter = 'all';
    page = 1;
  }

  /** Чтение правок свойств книг. */
  async function refreshProperties() {
    try {
      properties = await loadBookProperties();
    } catch {
      // Без правок список показывает то, что дал источник.
      properties = {};
    }
  }

  /** Сохранение правки открытой книги: список и карточка обновляются сразу. */
  async function saveProperties(entry: BookPropertyEntry) {
    if (!openedBook) {
      return;
    }
    const path = bookPath(openedBook);
    properties = await saveBookProperties(path, entry);
    openedBook = applyBookProperties([openedBook], properties, bookPath)[0];
  }

  /** Возврат открытой книги к значениям файла. */
  async function resetProperties() {
    await saveProperties({});
  }

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
    // Новый набор книг открывается с первой страницы.
    page = 1;
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
      supportedFormats = [...new Set(formats.map((value) => value.toLowerCase()))];
    } catch {
      supportedFormats = [];
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
  function bookFormats(book: Book): BookFormatInfo[] {
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

  /** Файл содержимого книги заданного формата (или читаемого по умолчанию).
   *
   * Если формат задан явно, файл другого формата не подставляется: иначе выбор
   * FB2 открывал бы PDF, когда совпадения нет.
   */
  function bookFile(book: Book, format?: string): BookFile | undefined {
    if (format) {
      const target = format.toLowerCase();
      return book.files.find(
        (file) => file.kind === 'book' && file.format.toLowerCase() === target,
      );
    }
    const target = bookFormat(book);
    return (
      book.files.find(
        (file) => file.kind === 'book' && file.format.toLowerCase() === target,
      ) ?? book.files.find((file) => file.kind === 'book')
    );
  }

  /** Абсолютный путь файла содержимого книги (вложение вкладки). */
  function bookPath(book: Book, format?: string): string {
    return absoluteBookPath(libraryRoot, bookFile(book, format)?.path ?? '');
  }

  /** Открытие книги вкладкой рабочего места. */
  function startReading(book: BookWithCover, format?: string) {
    onOpenInWorkplace({
      path: bookPath(book, format),
      title: book.title,
      format: format || bookFormat(book),
    });
  }

  /** Ошибка открытия файла книги. */
  let openError: string | null = $state(null);

  /** Формат файла, открываемого сейчас (или null). */
  let openingFormat: string | null = $state(null);

  /** Открытие файла заданного формата книги. */
  async function openFormatFile(book: BookWithCover, format: string) {
    openError = null;
    openingFormat = format;
    try {
      await openBookFile(bookPath(book, format));
    } catch (e) {
      openError = String(e);
    } finally {
      openingFormat = null;
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
    void refreshProperties();
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
    path={bookPath(openedBook)}
    formats={bookFormats(openedBook)}
    canRead={canRead(openedBook)}
    {openingFormat}
    {openError}
    userTags={openedBook.userTags ?? []}
    onClose={closeBook}
    onOpenFolder={() => void openBookFolder(bookPath(openedBook as BookWithCover))}
    onSaveProperties={(entry) => void saveProperties(entry)}
    onResetProperties={() => void resetProperties()}
    onAdd={(format) => startReading(openedBook as BookWithCover, format)}
    onOpen={(format) => openFormatFile(openedBook as BookWithCover, format)}
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
          placeholder={t('app.search.books.placeholder')}
          ariaLabel={t('app.search.books.placeholder')}
          icon="search"
          clearable
          class="w-full sm:w-auto sm:max-w-[24rem] sm:flex-1"
          oninput={onSearchInput}
        />
        <div class="flex flex-wrap items-center gap-2 sm:ml-auto">
          <span class="mr-auto role-caption text-[var(--muted-foreground)] sm:mr-0">
            {t('app.search.filter', { shown: viewBooks.length, total: books.length })}
          </span>
          <Select
            value={sortField}
            items={sortOptions}
            ariaLabel={t('app.library.orderLabel')}
            size="sm"
            class="w-[10.5rem]"
            onchange={chooseSort}
          />
          <Button
            variant="ghost"
            size="icon"
            title={sortDirection === 'asc' ? t('app.library.sort.desc') : t('app.library.sort.asc')}
            ariaLabel={sortDirection === 'asc'
              ? t('app.library.sort.desc')
              : t('app.library.sort.asc')}
            testId="library-sort-direction"
            onclick={toggleDirection}
          >
            <Icon name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} />
          </Button>
          <Select
            bind:value={coverFilter}
            items={coverOptions}
            ariaLabel={t('app.library.filterLabel')}
            size="sm"
            class="w-[9.5rem]"
            onchange={() => {
              // Другой фильтр — другой список: показываем его с начала.
              page = 1;
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            testId="library-filters-open"
            ariaLabel={t('app.library.filters.open')}
            onclick={() => (filtersOpen = true)}
          >
            <Icon name="layers" />
            {t('app.library.filters.open')}
            {#if filterCount > 0}
              <span
                class="role-caption text-[var(--muted-foreground)]"
                data-testid="library-filters-count">{filterCount}</span>
            {/if}
          </Button>
          <div
            class="flex flex-none items-center gap-0.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-0.5"
            role="group"
            aria-label={t('app.library.modeLabel')}
          >
            <Button
              variant={viewMode === 'grid' ? 'primary' : 'ghost'}
              size="icon"
              title={t('app.library.mode.tiles')}
              ariaLabel={t('app.library.mode.tiles')}
              ariaPressed={viewMode === 'grid'}
              onclick={() => chooseViewMode('grid')}
            >
              <Icon name="grid" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'primary' : 'ghost'}
              size="icon"
              title={t('app.library.mode.list')}
              ariaLabel={t('app.library.mode.list')}
              ariaPressed={viewMode === 'list'}
              onclick={() => chooseViewMode('list')}
            >
              <Icon name="list" />
            </Button>
          </div>
        </div>
      </div>
    {/if}

    <!--
      Панель фильтров: фасеты каталога с числом книг. Внутри фасета значения
      складываются «или», между фасетами действует «и».
    -->
    <Dialog
      bind:open={filtersOpen}
      title={t('app.library.filters.title')}
      class="w-[min(30rem,calc(100vw-1.5rem))]"
    >
      <div class="flex min-h-0 flex-col gap-3" data-testid="library-filters">
        {#if !hasFacets}
          <p class="m-0 role-body text-[var(--muted-foreground)]">
            {t('app.library.filters.empty')}
          </p>
        {:else}
          <div class="flex min-h-0 flex-col gap-3 overflow-y-auto">
            {#each FACET_IDS as id (id)}
              {@const values = facets[id]}
              {#if values.length > 0}
                <section class="flex flex-col gap-1">
                  <h3 class="role-caption text-[var(--muted-foreground)]">
                    {t(FACET_LABELS[id])}
                  </h3>
                  <div class="flex flex-col">
                    {#each values as item (item.value)}
                      <label
                        class="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 hover:bg-[var(--surface-hover)]"
                      >
                        <Checkbox
                          checked={filters[id].includes(item.value)}
                          onchange={() => onFacetToggle(id, item.value)}
                        />
                        <span class="min-w-0 flex-1 truncate role-body">{item.label}</span>
                        <span class="role-caption text-[var(--muted-foreground)]">{item.count}</span>
                      </label>
                    {/each}
                  </div>
                </section>
              {/if}
            {/each}
          </div>
        {/if}
        <div class="flex items-center justify-between gap-2 border-t border-[var(--divider)] pt-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={filterCount === 0 && coverFilter === 'all'}
            onclick={resetFilters}
          >
            {t('app.library.filters.reset')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            testId="library-filters-done"
            onclick={() => (filtersOpen = false)}
          >
            {t('app.library.filters.done')}
          </Button>
        </div>
      </div>
    </Dialog>

    <ScrollArea testId="library-page" class="p-4 md:p-6">
      <div bind:this={listTop} aria-hidden="true"></div>
      {#if !librarySelected}
        <EmptyState
          icon="library"
          title={t('app.library.empty.noLibrary.title')}
          description={t('app.library.empty.noLibrary.description')}
          testId="library-not-selected"
        />
      {:else if loading && books.length === 0}
        <Skeleton rows={3} rowClass="h-[16rem]" />
      {:else if error}
        <ErrorState message={error} testId="library-error" />
      {:else if books.length === 0}
        <EmptyState
          icon="book"
          title={t('app.library.empty.noBooks.title')}
          description={t('app.library.empty.noBooks.description')}
          testId="library-empty"
        />
      {:else if viewBooks.length === 0}
        <EmptyState
          icon="book"
          title={t('app.library.empty.filtered.title')}
          description={t('app.library.empty.filtered.description')}
          testId="library-filtered-empty"
        />
      {:else if viewMode === 'grid'}
        <ul
          class="grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fill,minmax(8rem,1fr))] md:gap-6 md:[grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]"
          data-testid="library-grid"
        >
          {#each pageBooks as book (book.id)}
            <li>
              <button
                class="group flex w-full cursor-pointer flex-col gap-2 rounded-[var(--radius)] p-2 text-left transition-colors [font:inherit] hover:bg-[var(--surface-hover)]"
                type="button"
                title={t('app.library.book.title')}
                onclick={() => openBook(book)}
              >
                <span
                  class="block overflow-hidden rounded-[var(--radius)]"
                >
                  <BookCover
                    src={book.coverUri ?? null}
                    imgClass="transition-transform duration-200 group-hover:scale-[1.02]"
                  />
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
          {#each pageBooks as book (book.id)}
            <li class="border-b border-[var(--divider)] last:border-b-0">
              <button
                class="flex w-full cursor-pointer items-center gap-3 p-2 text-left transition-colors [font:inherit] hover:bg-[var(--surface-hover)]"
                type="button"
                title={t('app.library.book.title')}
                onclick={() => openBook(book)}
              >
                <span class="block h-[4.5rem] w-[3rem] shrink-0">
                  <BookCover src={book.coverUri ?? null} class="h-full w-[3rem] rounded-sm" />
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

    <!--
      Постраничность списка: отдельная полоса под областью прокрутки, чтобы
      перелистывание было доступно без прокрутки до конца списка и не сдвигало
      полосу управления каталогом.
    -->
    {#if librarySelected && totalPages > 1}
      <nav
        class="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-inset)] px-4 py-2 md:px-6"
        aria-label={t('app.library.page.label')}
        data-testid="library-pagination"
      >
        <span class="role-caption text-[var(--muted-foreground)]">
          {t('app.library.page.status', { page: currentPage, total: totalPages })}
        </span>
        <div class="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={t('app.library.page.prev')}
            ariaLabel={t('app.library.page.prev')}
            disabled={currentPage <= 1}
            onclick={() => goToPage(currentPage - 1)}
          >
            <Icon name="chevron-left" />
          </Button>
          {#each pageItems as item, index (index)}
            {#if item === 'gap'}
              <span class="px-1 role-caption text-[var(--muted-foreground)]" aria-hidden="true">
                …
              </span>
            {:else}
              <Button
                variant={item === currentPage ? 'primary' : 'ghost'}
                size="sm"
                class="w-[2.25rem] px-0"
                title={t('app.library.page.go', { page: item })}
                ariaLabel={t('app.library.page.go', { page: item })}
                ariaCurrent={item === currentPage ? 'page' : undefined}
                onclick={() => goToPage(item)}
              >
                {item}
              </Button>
            {/if}
          {/each}
          <Button
            variant="ghost"
            size="icon"
            title={t('app.library.page.next')}
            ariaLabel={t('app.library.page.next')}
            disabled={currentPage >= totalPages}
            onclick={() => goToPage(currentPage + 1)}
          >
            <Icon name="chevron-right" />
          </Button>
        </div>
      </nav>
    {/if}
  </div>
{/if}
