<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    BookCover,
    Button,
    Checkbox,
    FilterList,
    EmptyState,
    ErrorState,
    Icon,
    Input,
    ScrollArea,
    SegmentedControl,
    Select,
    SidePanel,
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
    withWithoutCover,
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
    loadCovers,
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
    /** Переход к списку библиотек для выбора другой. */
    onChooseLibrary?: () => void;
  }

  let {
    initialActiveLibrary,
    visible = true,
    targetWorkspaceName = null,
    onOpenInWorkplace,
    onChooseLibrary,
  }: Props = $props();

  /** Открыта ли библиотека (есть активный корень). */
  let librarySelected = $state(untrack(() => initialActiveLibrary?.path != null));

  /** Книги библиотеки с обложками. */
  let books: BookWithCover[] = $state([]);

  /** Пользовательские правки и теги книг по абсолютному пути. */
  let properties: BookPropertyMap = $state({});

  /** Известные обложки книг: идентификатор → data URI либо `null`.
   *
   * Обложки грузятся только для видимых книг; `null` — обложки нет, чтобы
   * повторно не запрашивать её при каждом показе страницы.
   */
  let coverUris = $state<Record<string, string | null>>({});

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

  /** Идёт ли загрузка форматов чтения: страница книги показывает заглушку, не ошибку. */
  let formatsLoading = $state(false);

  /** Корень активной библиотеки для сборки абсолютного пути книги. */
  let libraryRoot = $state('');

  /** Корень, для которого уже загружен каталог: повторный выбор не перечитывает. */
  let libraryRootUsed = $state('');

  /** Режим показа книг: плитка или список. */
  let viewMode = $state<'grid' | 'list'>('grid');

  /** Варианты переключателя режима показа книг. */
  const viewModeItems = $derived([
    { value: 'grid', label: t('app.library.mode.tiles'), icon: 'grid' as const },
    { value: 'list', label: t('app.library.mode.list'), icon: 'list' as const },
  ]);

  /** Поле сортировки списка книг. */
  let sortField = $state<SortField>('title');

  /** Направление сортировки. */
  let sortDirection = $state<SortDirection>('asc');

  /** Выбранные значения фасетов. */
  let filters = $state<BookFilters>(emptyFilters());

  /** Открыта ли панель фильтров. */
  let filtersOpen = $state(false);

  /** Свёрнутые разделы фильтров: свёрнутый раздел не занимает места в панели. */
  let collapsedFacets = $state<Record<string, boolean>>({});

  /** Элементы разделов фильтров: к нужному разделу панель прокручивается. */
  const facetElements: Record<string, HTMLElement | undefined> = {};

  /** Запоминание элемента раздела при его появлении в разметке. */
  function registerFacet(node: HTMLElement, id: FacetId) {
    facetElements[id] = node;
    return {
      destroy: () => {
        delete facetElements[id];
      },
    };
  }

  /** Раздел, к которому панель прокручивается после открытия (или null). */
  let pendingFacet: FacetId | null = $state(null);

  /** Прокручиваемый список разделов фильтров. */
  let filterSections: HTMLElement | null = $state(null);

  /** Раздел, к которому пришёл пользователь: подсвечивается короткое время. */
  let highlightedFacet: FacetId | null = $state(null);

  /** Таймер снятия подсветки раздела. */
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;


  /** Номер показанной страницы списка (с единицы). */
  let page = $state(1);

  /** Элемент начала списка: после смены страницы список возвращается наверх. */
  let listTop: HTMLElement | null = $state(null);

  /** Варианты порядка книг для выпадающего списка. */
  const sortOptions = $derived(
    SORT_FIELDS.map((field) => ({ value: field.id, label: t(field.labelKey) })),
  );

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

  /** Книги с учётом фильтров и выбранного порядка. */
  const viewBooks = $derived(sortBooks(filterBooks(mergedBooks, filters), sortField, sortDirection, currentLocale()));

  /** Число страниц списка (не меньше одной). */
  const totalPages = $derived(Math.max(1, Math.ceil(viewBooks.length / LIBRARY_PAGE_SIZE)));

  /** Номер страницы в границах списка: фильтр может сократить число страниц. */
  const currentPage = $derived(Math.min(page, totalPages));

  /** Книги текущей страницы. */
  const pageBooks = $derived(
    viewBooks.slice((currentPage - 1) * LIBRARY_PAGE_SIZE, currentPage * LIBRARY_PAGE_SIZE),
  );

  /** Книги страницы с уже известными обложками. */
  const pageBooksWithCovers = $derived(
    pageBooks.map((book) =>
      coverUris[book.id] ? { ...book, coverUri: coverUris[book.id] as string } : book,
    ),
  );

  /** Номера страниц для перехода: окно из трёх страниц вокруг текущей. */
  const pageItems = $derived.by((): number[] => {
    const windowSize = 3;
    let start = Math.max(1, currentPage - 1);
    const end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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
  function chooseSort(field: SortField) {
    sortField = field;
    sortDirection = sortFieldInfo(field).defaultDirection;
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

  /** Фильтр «только без обложки». */
  function chooseWithoutCover(value: boolean) {
    filters = withWithoutCover(filters, value);
    page = 1;
  }

  /** Сброс всех фильтров. */
  function resetFilters() {
    filters = emptyFilters();
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
    // Карточка собирается заново из книги источника: снятая правка возвращает
    // значения файла, а не оставляет прежние.
    const source = books.find((book) => book.id === openedBook?.id) ?? openedBook;
    openedBook = applyBookProperties([source], properties, bookPath)[0];
  }

  /** Переход к списку книг с фильтром по свойству открытой книги. */
  function filterBy(kind: 'author' | 'format' | 'language' | 'tag', value: string) {
    openedBook = null;
    const facet =
      kind === 'author'
        ? 'authors'
        : kind === 'format'
          ? 'formats'
          : kind === 'language'
            ? 'languages'
            : 'tags';
    filters = { ...emptyFilters(), [facet]: [kind === 'format' ? value.toLowerCase() : value] };
    page = 1;
    // Переход с карточки книги ведёт в уже отфильтрованный список: панель
    // фильтров открывается сама, а раздел с выбранным значением разворачивается
    // и подводится в видимую часть. Без этого пользователь видит другой список
    // и не понимает, почему книг стало меньше.
    collapsedFacets = { ...collapsedFacets, [facet]: false };
    pendingFacet = facet;
    filtersOpen = true;
    highlightFacet(facet);
  }

  /**
   * Подсветка раздела, к которому пришёл пользователь.
   *
   * Прокрутка не всегда возможна: при коротком списке панель уже показывает
   * раздел целиком, и тогда переход ничем не отмечен. Подсветка отмечает
   * выбранный раздел в любом случае — пользователь видит, что фильтр применён
   * именно здесь.
   */
  function highlightFacet(id: FacetId) {
    highlightedFacet = id;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => (highlightedFacet = null), 2000);
  }

  /** Переключение свёрнутости раздела фильтров. */
  function toggleFacetSection(id: FacetId) {
    collapsedFacets = { ...collapsedFacets, [id]: !collapsedFacets[id] };
  }

  /** Прокрутка панели к разделу, к которому пришёл пользователь.
   *
   * Выполняется после раскрытия панели: до неё раздела ещё нет в разметке.
   * Прокрутка ставит раздел в начало видимой части — тогда выбранное значение
   * и подпись раздела оказываются на виду.
   */
  $effect(() => {
    const facet = pendingFacet;
    if (facet === null || !filtersOpen) {
      return;
    }
    untrack(() => {
      const section = facetElements[facet];
      if (!section) {
        return;
      }
      pendingFacet = null;
      const container = filterSections;
      if (!container) {
        return;
      }
      // Раздел уже виден, поэтому `scrollIntoView` ничего бы не сделал: список
      // прокручивается вручную, чтобы раздел встал в начало видимой части.
      // В тестовом окружении раскладки нет — прокрутка пропускается.
      const top = section.getBoundingClientRect().top - container.getBoundingClientRect().top;
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: container.scrollTop + top, behavior: 'auto' });
      }
    });
  });

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
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  /** Загрузка обложек видимых книг одним вызовом источника. */
  async function loadPageCovers(ids: string[]) {
    try {
      const covers = await loadCovers(ids);
      coverUris = { ...coverUris, ...covers };
    } catch {
      // Обложки не должны мешать списку: он показывается без них.
    }
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
    formatsLoading = true;
    try {
      const formats = await readerFormats();
      supportedFormats = [...new Set(formats.map((value) => value.toLowerCase()))];
    } catch {
      supportedFormats = [];
    } finally {
      formatsLoading = false;
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
    // Другая библиотека — другие обложки: прежние по тем же идентификаторам
    // показывать нельзя.
    coverUris = {};
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

  // Обложки запрашиваются только для видимых книг: base64 на весь каталог —
  // мегабайты, и список ждал бы их вместо первой отрисовки.
  $effect(() => {
    const missing = pageBooks
      .filter((book) => book.hasCover !== false && coverUris[book.id] === undefined)
      .map((book) => book.id);
    if (missing.length > 0) {
      void loadPageCovers(missing);
    }
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
    {formatsLoading}
    {openingFormat}
    {openError}
    {targetWorkspaceName}
    userEntry={properties[bookPath(openedBook)] ?? {}}
    onClose={closeBook}
    onOpenFolder={() => void openBookFolder(bookPath(openedBook as BookWithCover))}
    onSaveProperties={(entry) => void saveProperties(entry)}
    onResetProperties={() => void resetProperties()}
    onFilterBy={filterBy}
    onAdd={(format) => startReading(openedBook as BookWithCover, format)}
    onOpen={(format) => openFormatFile(openedBook as BookWithCover, format)}
  />
{:else}
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    {#if librarySelected}
      <!--
        Полоса управления каталогом.

        На смартфоне — две полосы: сверху фильтры и поиск со счётчиком (счётчик
        вплотную к полю, он относится к поиску), снизу сортировка и переключатель
        вида. На планшете и десктопе всё в одну строку: выбор библиотеки,
        фильтры, поиск со счётчиком, затем сортировка и вид. От сортировки
        счётчик отделяет отступ — счётчик не слипается с выпадающим списком.
      -->
      <div
        class="flex flex-none flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface-inset)] px-4 py-2.5 tablet:flex-row tablet:flex-wrap tablet:items-center tablet:gap-2 tablet:px-6 large-tablet:flex-nowrap"
        data-testid="library-controls"
      >
        <Button
          variant="secondary"
          testId="library-choose-top"
          ariaLabel={t('app.library.libraries.toList')}
          class="hidden large-tablet:inline-flex"
          onclick={() => onChooseLibrary?.()}
        >
          <Icon name="chevron-left" />
          {t('app.library.libraries.toList')}
        </Button>

        <div class="flex min-w-0 items-center gap-2 tablet:min-w-0 tablet:flex-1">
          <Button
            variant={filtersOpen ? 'primary' : 'secondary'}
            testId="library-filters-open"
            ariaLabel={t('app.library.filters.open')}
            ariaPressed={filtersOpen}
            onclick={() => (filtersOpen = !filtersOpen)}
          >
            <Icon name="layers" />
            {t('app.library.filters.open')}
            {#if filterCount > 0}
              <span
                class="role-caption text-[var(--muted-foreground)]"
                data-testid="library-filters-count">{filterCount}</span>
            {/if}
          </Button>

          <div class="flex min-w-0 flex-1 items-center gap-2">
            <Input
              bind:value={searchQuery}
              placeholder={t('app.search.books.placeholder')}
              ariaLabel={t('app.search.books.placeholder')}
              icon="search"
              clearable
              class="min-w-0 flex-1 tablet:max-w-[24rem]"
              oninput={onSearchInput}
            />
            <span
              class="shrink-0 role-caption whitespace-nowrap text-[var(--muted-foreground)]"
              data-testid="library-counter"
            >
              {t('app.search.filter', { shown: viewBooks.length, total: books.length })}
            </span>
          </div>
        </div>

        <!-- Растягивающийся разделитель: держит явный зазор между счётчиком
             поиска и группой сортировки на планшете и десктопе. -->
        <span class="hidden tablet:block tablet:w-6 tablet:flex-none" aria-hidden="true"></span>

        <div
          class="flex w-full min-w-0 items-center justify-end gap-2 tablet:w-auto tablet:flex-none"
        >
          <Button
            variant="secondary"
            size="icon"
            title={sortDirection === 'asc'
              ? t('app.library.sort.desc')
              : t('app.library.sort.asc')}
            ariaLabel={sortDirection === 'asc'
              ? t('app.library.sort.desc')
              : t('app.library.sort.asc')}
            testId="library-sort-direction"
            onclick={toggleDirection}
          >
            <Icon name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} />
          </Button>
          <Select
            value={sortField}
            items={sortOptions}
            ariaLabel={t('app.library.filters.sort')}
            class="min-w-0 w-[9.5rem] tablet:w-[11rem]"
            onchange={(value) => chooseSort(value as SortField)}
          />
          <SegmentedControl
            items={viewModeItems}
            value={viewMode}
            ariaLabel={t('app.library.modeLabel')}
            onchange={(next) => chooseViewMode(next as 'grid' | 'list')}
          />
        </div>
      </div>
    {/if}


    <div class="relative flex min-h-0 min-w-0 flex-1">
      {#if filtersOpen}
        <SidePanel
          title={t('app.library.filters.title')}
          testId="library-filters"
          side="left"
          class="w-full large-tablet:w-[19rem]"
          onClose={() => (filtersOpen = false)}
        >
          <div class="flex min-h-0 flex-1 flex-col">
            <div
              class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2"
              data-testid="library-filter-sections"
              bind:this={filterSections}
            >
              <!-- Обложка — обычный флажок: сворачивать нечего. -->
              <label
                class="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 hover:bg-[var(--surface-hover)]"
              >
                <Checkbox
                  checked={filters.withoutCover}
                  onchange={() => chooseWithoutCover(!filters.withoutCover)}
                />
                <span class="min-w-0 flex-1 truncate role-body">
                  {t('app.library.filters.withoutCover')}
                </span>
              </label>

              {#each FACET_IDS as id (id)}
                {@const values = facets[id]}
                {@const selected = filters[id]}
                {#if values.length > 0}
                  <!--
                    Раздел фильтра сворачивается: длинный список авторов не
                    вытесняет остальные разделы. Выбранное число всегда видно на
                    заголовке, поэтому свёрнутый раздел не скрывает, что он
                    фильтрует список.
                  -->
                  <section
                    class="flex flex-col gap-1 rounded-[var(--radius)] transition-colors {highlightedFacet ===
                    id
                      ? 'bg-[var(--surface-selected)] ring-1 ring-[var(--primary-border)]'
                      : ''}"
                    use:registerFacet={id}
                    data-testid="library-facet-section-{id}"
                  >
                    <button
                      type="button"
                      class="flex w-full cursor-pointer items-center gap-1.5 rounded-[var(--radius)] px-2 py-1 text-left transition-colors [font:inherit] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                      aria-expanded={!collapsedFacets[id]}
                      aria-controls="library-facet-{id}"
                      data-testid="library-facet-toggle-{id}"
                      onclick={() => toggleFacetSection(id)}
                    >
                      <Icon
                        name={collapsedFacets[id] ? 'chevron-right' : 'chevron-down'}
                        class="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]"
                      />
                      <span class="min-w-0 flex-1 truncate role-caption text-[var(--muted-foreground)]">
                        {t(FACET_LABELS[id])}
                      </span>
                      {#if selected.length > 0}
                        <span
                          class="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[0.625rem] font-semibold text-[var(--primary-foreground)]"
                          title={t('app.library.filters.selected', { count: selected.length })}
                          data-testid="library-facet-count-{id}"
                        >
                          {selected.length}
                        </span>
                      {/if}
                    </button>
                    {#if !collapsedFacets[id]}
                      <div id="library-facet-{id}">
                        <FilterList
                          items={values}
                          {selected}
                          onToggle={(value) => onFacetToggle(id, value)}
                          searchPlaceholder={t('app.library.filters.search')}
                          emptyText={t('app.library.filters.notFound')}
                          testId="library-facet-{id}"
                        />
                      </div>
                    {/if}
                  </section>
                {/if}
              {/each}
            </div>
            <div
              class="flex flex-none items-center gap-2 border-t border-[var(--divider)] px-3 py-2"
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={filterCount === 0}
                onclick={resetFilters}
              >
                {t('app.library.filters.reset')}
              </Button>
            </div>
          </div>
        </SidePanel>
      {/if}

      <ScrollArea testId="library-page" class="p-4 tablet:p-6">
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
            class="grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fill,minmax(8rem,1fr))] tablet:gap-6 tablet:[grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))] desktop:[grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] large-desktop:[grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]"
            data-testid="library-grid"
          >
            {#each pageBooksWithCovers as book (book.id)}
              <li>
                <button
                  class="group flex w-full cursor-pointer flex-col gap-2 rounded-[var(--radius)] p-2 text-left transition-colors [font:inherit] hover:bg-[var(--surface-hover)]"
                  type="button"
                  title={book.title}
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
            {#each pageBooksWithCovers as book (book.id)}
              <li
                class="border-b border-[var(--divider)] last:border-b-0 even:bg-[var(--surface-inset)]"
              >
                <button
                  class="flex w-full cursor-pointer items-center gap-3 p-2 text-left transition-colors [font:inherit] hover:bg-[var(--surface-hover)]"
                  type="button"
                  title={book.title}
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

    </div>

    <!--
      Нижняя полоса раздела: выбор библиотеки и постраничность в одной строке.
      Кнопка «Библиотеки» слева всегда доступна из списка книг, иначе из книг
      активной библиотеки нельзя было бы выбрать другую. Постраничность — справа,
      окно из трёх страниц вокруг текущей и переходы к началу и концу: всех
      номеров нет даже на десктопе. Кнопки одинаковы на всех режимах, а на
      смартфоне (подступень `phone`, как `PHONE_MAX_WIDTH`) от окна остаётся одна текущая
      страница — иначе строка не помещается. Планшет и десктоп показывают три.
    -->
    {#if librarySelected}
      <nav
        class="flex flex-none items-center gap-2 overflow-hidden border-t border-[var(--border)] bg-[var(--surface-inset)] px-4 py-2 tablet:px-6 {totalPages >
        1
          ? ''
          : 'large-tablet:hidden'}"
        aria-label={t('app.library.page.label')}
        data-testid="library-pagination"
      >
        <Button
          variant="secondary"
          size="sm"
          testId="library-choose"
          ariaLabel={t('app.library.libraries.toList')}
          class="large-tablet:hidden"
          onclick={() => onChooseLibrary?.()}
        >
          <Icon name="chevron-left" />
          {t('app.library.libraries.toList')}
        </Button>

        {#if totalPages > 1}
          <span class="ml-auto hidden truncate role-caption text-[var(--muted-foreground)] large-tablet:block">
            {t('app.library.page.status', { page: currentPage, total: totalPages })}
          </span>
          <div class="ml-auto flex flex-none items-center gap-0.5 large-tablet:ml-3">
            <Button
              variant="ghost"
              size="icon"
              title={t('app.library.page.first')}
              ariaLabel={t('app.library.page.first')}
              disabled={currentPage <= 1}
              onclick={() => goToPage(1)}
            >
              <Icon name="chevrons-left" />
            </Button>
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
            {#each pageItems as item (item)}
              <Button
                variant={item === currentPage ? 'primary' : 'ghost'}
                size="sm"
                class="w-[2.25rem] px-0 {item === currentPage ? '' : 'hidden phone:inline-flex'}"
                title={t('app.library.page.go', { page: item })}
                ariaLabel={t('app.library.page.go', { page: item })}
                ariaCurrent={item === currentPage ? 'page' : undefined}
                onclick={() => goToPage(item)}
              >
                {item}
              </Button>
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
            <Button
              variant="ghost"
              size="icon"
              title={t('app.library.page.last')}
              ariaLabel={t('app.library.page.last')}
              disabled={currentPage >= totalPages}
              onclick={() => goToPage(totalPages)}
            >
              <Icon name="chevrons-right" />
            </Button>
          </div>
        {/if}
      </nav>
    {/if}
  </div>
{/if}
