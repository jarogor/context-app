<script lang="ts">
  import { t } from '@context/i18n';
  import { untrack } from 'svelte';
  import { EmptyState, Icon, Input, SidePanel, Skeleton } from '@context/ui';
  import type { FileAnnotation, FileBookmark, FileChapter, FilePropertiesSnapshot, PropertiesTabId } from '../reader/file-properties';
  import { propertyTabs } from '../reader/file-properties';

  interface Props {
    /** Снимок свойств открытой книги. */
    snapshot: FilePropertiesSnapshot;
    /** Выбранная пользователем вкладка панели; `null` — первая доступная. */
    tab: PropertiesTabId | null;
    /** Текущая страница чтения для отметки в превью. */
    currentPage: number | null;
    /** Переход к главе текучей книги. */
    onGoToChapter?: (chapter: FileChapter) => void;
    /** Переход к странице по закладке. */
    onGoToBookmark?: (bookmark: FileBookmark) => void;
    /** Переход к странице из превью. */
    onGoToPage?: (page: number) => void;
    /** Выбор вкладки панели. */
    onSelectTab?: (tab: PropertiesTabId) => void;
    /** Запрос миниатюр для перечисленных страниц. */
    onRequestThumbs?: (pages: number[], width: number) => void;
    /** Запуск анализа встроенных пометок. */
    onAnalyzeAnnotations?: () => void;
    /** Остановка анализа встроенных пометок. */
    onStopAnnotations?: () => void;
    /** Переключение показа встроенной пометки на странице. */
    onToggleAnnotation?: (annotation: FileAnnotation, shown: boolean) => void;
    /** Перегенерация превью страниц (кэш картинок удаляется). */
    onRegenerateThumbs?: () => void;
    /** Закрытие панели (на узком окне панель перекрывает содержимое). */
    onClose?: () => void;
  }

  let {
    snapshot,
    tab,
    currentPage,
    onGoToChapter,
    onGoToBookmark,
    onGoToPage,
    onSelectTab,
    onRequestThumbs,
    onAnalyzeAnnotations,
    onStopAnnotations,
    onToggleAnnotation,
    onRegenerateThumbs,
    onClose,
  }: Props = $props();

  /** Доступные вкладки панели для текущего снимка. */
  const tabs = $derived(propertyTabs(snapshot));

  /** Действующая вкладка: выбранная, если доступна, иначе первая доступная. */
  const activeTab = $derived(tab && tabs.includes(tab) ? tab : (tabs[0] ?? null));

  /** Заголовки вкладок. */
  const TAB_TITLES: Record<PropertiesTabId, string> = $derived({
    contents: t('app.properties.contents'),
    bookmarks: t('app.properties.bookmarks'),
    pages: t('app.properties.pages'),
    annotations: t('app.properties.annotations'),
  });

  /** Поиск по текущему списку. */
  let query = $state('');

  /** Пометки, включённые для показа на странице; по умолчанию ни одной.
   *
   * Пометки — чужой слой внутри файла, сделанный неизвестно кем: он может
   * конфликтовать с заметками приложения. Поэтому по умолчанию он выключен, и
   * включается только явно — галочкой в списке или кнопкой «Показать».
   */
  let shownAnnotations = $state<Set<string>>(new Set());

  /** Список страниц для превью: контейнер прокрутки и первая видимая страница. */
  let pagesListEl: HTMLDivElement | undefined = $state();

  /** Номер первой видимой страницы (по прокрутке списка). */
  let windowStart = $state(1);

  /** Страницы книги для превью: список строится один раз на снимок. */
  const pageNumbers = $derived.by(() =>
    Array.from({ length: snapshot.pageCount ?? 0 }, (_, index) => index + 1),
  );

  /** Сколько узлов держать в разметке: окно прокрутки плюс запас. */
  const VISIBLE_PAGES = 60;

  /** Число колонок сетки превью и высота строки (измеряются по разметке). */
  let columns = $state(4);
  let rowHeight = $state(176);

  /** Последняя страница окна в разметке. */
  const windowEnd = $derived(
    Math.min(pageNumbers.length, windowStart + VISIBLE_PAGES - 1),
  );

  /** Страницы в разметке.
   *
   * Для книги в тысячу страниц разметка всех узлов (картинка, подпись, кнопка)
   * — это тысячи элементов, которые движок раскладывает при каждом обновлении.
   * В разметке живёт только окно вокруг прокрутки; пропущенные строки заменены
   * распорками той же высоты, поэтому полоса прокрутки и положение страниц
   * остаются верными.
   *
   * Окно выровнено по границе строки: тогда распорка до него — целое число
   * строк и превью не съезжают по колонкам.
   */
  const visiblePages = $derived.by(() =>
    pageNumbers.slice(windowStart - 1, windowEnd),
  );

  /** Строк до окна в разметке. */
  const rowsBefore = $derived(Math.floor((windowStart - 1) / columns));

  /** Строк после окна в разметке. */
  const rowsAfter = $derived(
    Math.ceil(Math.max(0, pageNumbers.length - windowEnd) / columns),
  );

  /** Измерение сетки превью: колонки и высота строки.
   *
   * Размеры зависят от ширины панели и масштаба интерфейса, поэтому берутся у
   * отрисованного узла, а не задаются числом.
   */
  $effect(() => {
    if (activeTab !== 'pages') {
      return;
    }
    const list = pagesListEl;
    const slot = list?.querySelector('[data-testid="properties-page"]') as
      | HTMLElement
      | null;
    if (!list || !slot) {
      return;
    }
    const width = slot.offsetWidth > 0 ? slot.offsetWidth : 96;
    const gap = 8;
    const measured = Math.max(1, Math.floor((list.clientWidth + gap) / (width + gap)));
    if (measured !== columns) {
      columns = measured;
    }
    if (slot.offsetHeight > 0 && slot.offsetHeight !== rowHeight) {
      rowHeight = slot.offsetHeight;
    }
  });

  /** Сколько страниц держать заказанными от первой видимой. */
  const THUMB_WINDOW = 24;

  /** Ширина миниатюры в пикселях: заказывается у модуля и задаёт слот превью. */
  const THUMB_WIDTH = 96;

  /** Пункты содержания с фильтром по запросу. */
  const contents = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return snapshot.chapters;
    }
    return snapshot.chapters.filter((chapter) => chapter.title.toLowerCase().includes(needle));
  });

  /** Плоский список закладок в порядке обхода с уровнем вложенности. */
  const bookmarkRows = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const rows: Array<{ bookmark: FileBookmark; level: number; key: string }> = [];

    /** Обход дерева закладок. */
    function walk(items: FileBookmark[], level: number, prefix: string) {
      for (let index = 0; index < items.length; index += 1) {
        const bookmark = items[index];
        const key = `${prefix}.${index}`;
        if (!needle || bookmark.title.toLowerCase().includes(needle)) {
          rows.push({ bookmark, level, key });
        }
        // Дети обходятся всегда: пункт без совпадения может держать совпавшие
        // вложенные пункты, и терять их при поиске нельзя.
        walk(bookmark.children, level + 1, key);
      }
    }

    walk(snapshot.bookmarks, 0, 'b');
    return rows;
  });

  /** Встроенные пометки с фильтром по тексту, комментарию и автору. */
  const annotations = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return snapshot.annotations;
    }
    return snapshot.annotations.filter(
      (annotation) =>
        annotation.quote.toLowerCase().includes(needle) ||
        annotation.comment.toLowerCase().includes(needle) ||
        annotation.author.toLowerCase().includes(needle),
    );
  });

  /** Подпись вида встроенной пометки. */
  function annotationKindLabel(kind: FileAnnotation['kind']): string {
    return t(`app.properties.annotation.${kind}`);
  }

  /** Место пометки и её автор. */
  function annotationPlace(annotation: FileAnnotation): string {
    const page = t('app.note.page', { page: annotation.page });
    return annotation.author ? `${page} · ${annotation.author}` : page;
  }

  /** Включение и выключение показа пометки на странице.
   *
   * Пометка включается явно: кликом по галочке или кнопкой «Показать». При
   * включении страница чтения переходит к её месту — иначе пометка на другой
   * странице оказалась бы вне экрана и включение выглядело бы безрезультатным.
   */
  function setAnnotationShown(annotation: FileAnnotation, shown: boolean) {
    const next = new Set(shownAnnotations);
    if (shown) {
      next.add(annotation.id);
      onGoToPage?.(annotation.page);
    } else {
      next.delete(annotation.id);
    }
    shownAnnotations = next;
    onToggleAnnotation?.(annotation, shown);
  }

  /** Снятие показа всех пометок файла. */
  function hideAllAnnotations() {
    const shown = snapshot.annotations.filter((annotation) =>
      shownAnnotations.has(annotation.id),
    );
    shownAnnotations = new Set();
    for (const annotation of shown) {
      onToggleAnnotation?.(annotation, false);
    }
  }

  /** Показ только этой пометки, остальные снимаются.
   *
   * Уже показанные пометки снимаются по одной: формат рисует их пачкой по
   * списку, и одной команды «покажи другую» недостаточно.
   */
  function showOnlyAnnotation(annotation: FileAnnotation) {
    const shown = snapshot.annotations.filter(
      (candidate) => candidate.id !== annotation.id && shownAnnotations.has(candidate.id),
    );
    for (const candidate of shown) {
      onToggleAnnotation?.(candidate, false);
    }
    shownAnnotations = new Set([annotation.id]);
    onGoToPage?.(annotation.page);
    onToggleAnnotation?.(annotation, true);
  }

  /** Признак незавершённого анализа пометок. */
  const annotating = $derived(
    snapshot.annotationsSupported &&
      !snapshot.annotationsDone &&
      snapshot.annotationsProcessed > 0,
  );

  /** Заказ недостающих миниатюр видимого окна списка.
   *
   * Заказываются только страницы, которые читатель видит, плюс небольшой запас
   * вперёд: у книги на тысячи страниц заказ всей книги заранее занял бы минуты
   * и память. Окно следует за прокруткой списка, поэтому при листании
   * дорисовывается только новое.
   *
   * Каждая страница заказывается **один раз**: запрос отмечается сразу, поэтому
   * обновление снимка (пришедшая порция) не запускает новый заказ тех же
   * страниц. Без этого панель заказывала бы снова и снова всё, что ещё не
   * нарисовано, — а страницу, которую формат не может нарисовать, это
   * превращало в бесконечный цикл отрисовки.
   */
  let requestedThumbs = new Set<number>();

  /** Номер перегенерации, для которого набран набор заказов. */
  let requestedEpoch = $state(-1);

  /** Начало нового набора заказов после перегенерации превью.
   *
   * Перегенерация меняет номер в снимке: прежние заказы забываются, и панель
   * снова просит все страницы видимого окна. Без этого уже заказанные страницы
   * оставались бы в наборе, и после «Обновить» не появлялись бы ни они, ни
   * прежде пропущенные.
   */
  $effect(() => {
    const epoch = snapshot.thumbsEpoch;
    if (epoch !== requestedEpoch) {
      requestedEpoch = epoch;
      requestedThumbs = new Set();
      reachedPage = 1;
    }
  });

  /** Самая дальняя просмотренная страница: до неё заказ добирает пропуски. */
  let reachedPage = $state(1);

  $effect(() => {
    if (activeTab !== 'pages' || !snapshot.thumbnails) {
      return;
    }
    const from = Math.max(1, windowStart);
    const end = Math.min(pageNumbers.length, from + THUMB_WINDOW - 1);
    if (end > reachedPage) {
      reachedPage = end;
    }
    // Первыми идут видимые страницы: их ждёт пользователь.
    const visible = pageNumbers
      .filter(
        (page) =>
          page >= from &&
          page <= end &&
          !snapshot.thumbs[page] &&
          !requestedThumbs.has(page),
      )
      .slice(0, 12);
    // Затем — пропуски до просмотренного места по возрастанию: прыжок
    // прокрутки перескакивает окно, и страницы между старым и новым окном
    // иначе не попали бы в заказ никогда — на их месте оставалась «дыра».
    const gap = pageNumbers
      .filter(
        (page) =>
          page <= reachedPage &&
          (page < from || page > end) &&
          !snapshot.thumbs[page] &&
          !requestedThumbs.has(page),
      )
      .slice(0, Math.max(0, 12 - visible.length));
    const missing = [...visible, ...gap];
    if (missing.length === 0) {
      return;
    }
    for (const page of missing) {
      requestedThumbs.add(page);
    }
    onRequestThumbs?.(missing, THUMB_WIDTH);
  });

  /** Догрузка превью при прокрутке списка страниц.
   *
   * Окно начинается со строки, в которую попала прокрутка, и всегда выровнено
   * по границе строки: только тогда распорка до окна занимает целое число строк
   * и сетка не съезжает по колонкам. Окно следует за прокруткой, поэтому
   * заказанными остаются только видимые страницы; иначе каждое добавление
   * картинок (список становится выше) снова считалось бы «дошли до конца», и
   * заказ лавиной доходил бы до всей книги.
   */
  function handlePagesScroll() {
    const list = pagesListEl;
    if (!list || activeTab !== 'pages' || pageNumbers.length === 0) {
      return;
    }
    const scrollTop = list.scrollTop;
    const firstRow = Math.max(0, Math.floor(scrollTop / Math.max(1, rowHeight + 8)));
    const start = firstRow * columns + 1;
    if (start !== windowStart) {
      windowStart = Math.min(pageNumbers.length, Math.max(1, start));
    }
  }

  /** Начало анализа пометок при открытии вкладки, если он ещё не выполнен.
   *
   * Запрос отправляется один раз: анализ меняет снимок (прогресс, завершение),
   * и без признака «уже запрошено» эффект запускал бы новый разбор на каждое
   * своё же изменение.
   */
  let analysisRequested = $state(false);
  $effect(() => {
    if (
      activeTab !== 'annotations' ||
      !snapshot.annotationsSupported ||
      snapshot.annotationsDone ||
      snapshot.annotationsError ||
      snapshot.annotationsCached ||
      analysisRequested
    ) {
      return;
    }
    analysisRequested = true;
    untrack(() => onAnalyzeAnnotations?.());
  });

  /** Сброс признака запроса при смене книги: у новой книги пометок ещё нет. */
  $effect(() => {
    const supported = snapshot.annotationsSupported;
    if (!supported) {
      analysisRequested = false;
    }
  });
</script>

  {#snippet tabsSnippet()}
    <!--
      Состав вкладок зависит от формата книги: содержание есть у текучих книг,
      закладки — у страничных, превью и встроенные пометки — у тех форматов,
      которые умеют их разбирать. Полоса вкладок стоит над поиском и не зависит
      от него: смена вкладки не сдвигает основание панели.
    -->
    <div
      class="flex flex-wrap gap-0.5"
      role="tablist"
      aria-label={t('app.properties.tabs')}
      data-testid="properties-tabs"
    >
      {#each tabs as item (item)}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === item}
          class="cursor-pointer rounded-[var(--radius)] px-2 py-1 role-caption transition-colors {activeTab ===
          item
            ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
            : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'}"
          data-testid="properties-tab-{item}"
          onclick={() => onSelectTab?.(item)}
        >
          {TAB_TITLES[item]}
        </button>
      {/each}
    </div>
  {/snippet}

  {#snippet searchSnippet()}
    <Input
      bind:value={query}
      placeholder={t('app.properties.search')}
      ariaLabel={t('app.properties.search')}
      icon="search"
      clearable
    />
  {/snippet}

<SidePanel
  title={t('app.properties.title')}
  testId="properties-panel"
  side="left"
  showSearch={activeTab === 'contents' || activeTab === 'bookmarks' || activeTab === 'annotations'}
  class="w-[var(--properties-panel-width)]"
  tabs={tabs.length > 0 ? tabsSnippet : undefined}
  search={searchSnippet}
  {onClose}
>

  {#if tabs.length === 0}
    <div class="p-4" data-testid="properties-empty">
      <EmptyState
        icon="book"
        title={t('app.properties.empty.title')}
        description={t('app.properties.empty.description')}
      />
    </div>
  {:else}
    <div
      class="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-testid="properties-body"
      bind:this={pagesListEl}
      onscroll={handlePagesScroll}
    >
      {#if activeTab === 'contents'}
        <ul class="m-0 list-none p-1" data-testid="properties-contents">
          {#each contents as chapter (chapter.index)}
            <li>
              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left role-body transition-colors hover:bg-[var(--surface-hover)]"
                data-testid="properties-content-row"
                onclick={() => onGoToChapter?.(chapter)}
              >
                <Icon name="list" class="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                <span class="min-w-0 flex-1 truncate">{chapter.title}</span>
              </button>
            </li>
          {:else}
            <li class="px-2 py-4 text-center role-body text-[var(--muted-foreground)]">
              {t('app.properties.contents.empty')}
            </li>
          {/each}
        </ul>
      {:else if activeTab === 'bookmarks'}
        <ul class="m-0 list-none p-1" data-testid="properties-bookmarks">
          {#each bookmarkRows as row (row.key)}
            <li style="padding-left: {row.level * 0.75}rem">
              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left role-body transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-60"
                data-testid="properties-bookmark-row"
                disabled={row.bookmark.page === null}
                title={row.bookmark.title}
                onclick={() => onGoToBookmark?.(row.bookmark)}
              >
                <Icon name="bookmark" class="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                <span class="min-w-0 flex-1 truncate">
                  {row.bookmark.title || t('app.properties.bookmarks.untitled')}
                </span>
                {#if row.bookmark.page !== null}
                  <span class="shrink-0 role-caption text-[var(--muted-foreground)]"
                    >{t('app.note.page', { page: row.bookmark.page })}</span
                  >
                {/if}
              </button>
            </li>
          {:else}
            <li class="px-2 py-4 text-center role-body text-[var(--muted-foreground)]">
              {t('app.properties.bookmarks.empty')}
            </li>
          {/each}
        </ul>
      {:else if activeTab === 'pages'}
        <!--
          Полоса управления превью стоит над сеткой и не сдвигается ею: это
          отдельная строка постоянной высоты, а не часть прокручиваемого списка.
        -->
        <div class="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <button
            type="button"
            class="cursor-pointer rounded-[var(--radius)] px-2 py-1 role-caption text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            data-testid="properties-pages-regenerate"
            onclick={() => onRegenerateThumbs?.()}
          >
            {t('app.properties.pages.regenerate')}
          </button>
        </div>
        <div
          class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 p-2"
          data-testid="properties-pages"
        >
          <!--
            Распорка до окна: пропущенные строки занимают то же место, что заняли
            бы их превью, поэтому полоса прокрутки соответствует всей книге.
          -->
          {#if rowsBefore > 0}
            <span
              class="col-span-full"
              style="height: {rowsBefore * (rowHeight + 8)}px"
              aria-hidden="true"
              data-testid="properties-pages-before"
            ></span>
          {/if}
          {#each visiblePages as page (page)}
            <!--
              Слот превью одинаковой высоты во всех состояниях: картинка, ожидание
              и место вне заказанного окна. Список не меняет высоту по мере
              дорисовки, поэтому прокрутка не «прыгает», а окно заказа не
              разрастается от собственного роста.
            -->
            <button
              type="button"
              class="flex h-[10rem] cursor-pointer flex-col items-center gap-1 overflow-hidden rounded-[var(--radius)] p-1 transition-colors {currentPage ===
              page
                ? 'bg-[var(--surface-selected)]'
                : 'hover:bg-[var(--surface-hover)]'}"
              aria-label={t('app.note.page', { page })}
              aria-current={currentPage === page ? 'true' : undefined}
              data-testid="properties-page"
              onclick={() => onGoToPage?.(page)}
            >
              {#if snapshot.thumbs[page]}
                <img
                  src={snapshot.thumbs[page]}
                  alt={t('app.note.page', { page })}
                  class="min-h-0 w-full flex-1 rounded-[0.25rem] border border-[var(--border)] object-contain"
                />
              {:else}
                <span
                  class="flex min-h-0 w-full flex-1 items-center justify-center rounded-[0.25rem] border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
                  data-testid={page >= windowStart && page < windowStart + THUMB_WINDOW
                    ? 'properties-page-pending'
                    : 'properties-page-idle'}
                >
                  <Icon name="book" />
                </span>
              {/if}
              <span class="shrink-0 role-caption text-[var(--muted-foreground)]">{page}</span>
            </button>
          {/each}
          {#if rowsAfter > 0}
            <span
              class="col-span-full"
              style="height: {rowsAfter * (rowHeight + 8)}px"
              aria-hidden="true"
              data-testid="properties-pages-after"
            ></span>
          {/if}
        </div>
      {:else if activeTab === 'annotations'}
        <!--
          Пояснение стоит **над списком**: здесь его видно сразу, а под списком
          его никто не находит. Оно объясняет, почему чужой слой файла выключен
          и как его включить.
        -->
        <p
          class="border-b border-[var(--border)] px-3 py-2 role-caption text-[var(--muted-foreground)]"
          data-testid="properties-annotations-hint"
        >
          {t('app.properties.annotations.hint')}
        </p>
        <div class="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <span
            class="min-w-0 flex-1 role-caption text-[var(--muted-foreground)]"
            data-testid="properties-annotations-status"
          >
            {#if snapshot.annotationsDone}
              {t('app.properties.annotations.found', { count: snapshot.annotations.length })}
            {:else if annotating}
              {t('app.properties.annotations.progress', {
                processed: snapshot.annotationsProcessed,
                total: snapshot.annotationsTotal ?? '?',
              })}
            {:else}
              {t('app.properties.annotations.ready')}
            {/if}
          </span>
          {#if snapshot.annotationsDone}
            <button
              type="button"
              class="cursor-pointer rounded-[var(--radius)] px-2 py-1 role-caption text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              data-testid="properties-annotations-rescan"
              onclick={() => onAnalyzeAnnotations?.()}
            >
              {t('app.properties.annotations.rescan')}
            </button>
          {:else if annotating}
            <button
              type="button"
              class="cursor-pointer rounded-[var(--radius)] px-2 py-1 role-caption text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              data-testid="properties-annotations-stop"
              onclick={() => onStopAnnotations?.()}
            >
              {t('app.properties.annotations.stop')}
            </button>
          {/if}
        </div>
        {#if snapshot.annotationsError}
          <p class="px-3 py-2 role-caption text-[var(--destructive)]">
            {snapshot.annotationsError}
          </p>
        {/if}
        {#if shownAnnotations.size > 0}
          <div class="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <span class="role-caption text-[var(--muted-foreground)]"
              >{t('app.properties.annotations.shown', { count: shownAnnotations.size })}</span
            >
            <button
              type="button"
              class="ml-auto cursor-pointer rounded-[var(--radius)] px-2 py-1 role-caption text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              data-testid="properties-annotations-hide-all"
              onclick={hideAllAnnotations}
            >
              {t('app.properties.annotations.hideAll')}
            </button>
          </div>
        {/if}
        <ul class="m-0 list-none p-1" data-testid="properties-annotations">
          {#each annotations as annotation (annotation.id)}
            <li
              class="flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 transition-colors {shownAnnotations.has(
                annotation.id,
              )
                ? 'bg-[var(--surface-selected)]'
                : 'hover:bg-[var(--surface-hover)]'}"
            >
              <!--
                Галочка — единственный переключатель показа: по умолчанию она
                снята, и чужой слой файла на странице не появляется.
              -->
              <input
                type="checkbox"
                class="size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                checked={shownAnnotations.has(annotation.id)}
                aria-label={t('app.properties.annotations.toggle', {
                  text: annotation.quote || annotation.comment || annotationKindLabel(annotation.kind),
                })}
                data-testid="properties-annotation-toggle"
                onchange={(event) =>
                  setAnnotationShown(annotation, event.currentTarget.checked)}
              />
              <button
                type="button"
                class="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left [font:inherit]"
                title={t('app.properties.annotations.show')}
                data-testid="properties-annotation-row"
                onclick={() => showOnlyAnnotation(annotation)}
              >
                <span class="flex w-full items-center gap-2">
                  <span
                    class="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--border)]"
                    style="background: {annotation.color || 'transparent'}"
                    aria-hidden="true"
                  ></span>
                  <span class="min-w-0 flex-1 truncate role-body">
                    {annotation.quote ||
                      annotation.comment ||
                      annotationKindLabel(annotation.kind)}
                  </span>
                  <span class="shrink-0 role-caption text-[var(--muted-foreground)]"
                    >{annotationKindLabel(annotation.kind)}</span
                  >
                </span>
                <span class="role-caption text-[var(--muted-foreground)]"
                  >{annotationPlace(annotation)}{annotation.comment && annotation.quote
                    ? ` — ${annotation.comment}`
                    : ''}</span
                >
              </button>
            </li>
          {:else}
            <li class="px-2 py-4 text-center role-body text-[var(--muted-foreground)]">
              {#if annotating}
                <Skeleton rows={3} rowClass="h-10" />
              {:else if snapshot.annotationsError}
                {t('app.properties.annotations.failed')}
              {:else}
                {t('app.properties.annotations.empty')}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</SidePanel>
