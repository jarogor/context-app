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

  /** Идентификатор пометки, показанной на странице; `null` — не показана. */
  let shownId = $state<string | null>(null);

  /** Список страниц для превью: контейнер прокрутки и докуда заказаны миниатюры. */
  let pagesListEl: HTMLDivElement | undefined = $state();
  let requestedUntil = $state(24);

  /** Шаг догрузки миниатюр при прокрутке списка превью. */
  const THUMB_PAGE_STEP = 24;

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

  /** Переключение показа пометки на странице.
   *
   * При включении страница чтения переходит к месту пометки: иначе пометка,
   * найденная на другой странице, оказывалась бы вне экрана и нажатие выглядело
   * бы безрезультатным.
   */
  function toggleAnnotation(annotation: FileAnnotation) {
    const shown = shownId === annotation.id;
    shownId = shown ? null : annotation.id;
    if (!shown) {
      onGoToPage?.(annotation.page);
    }
    onToggleAnnotation?.(annotation, !shown);
  }

  /** Страницы книги для превью: список строится один раз на снимок. */
  const pageNumbers = $derived.by(() =>
    Array.from({ length: snapshot.pageCount ?? 0 }, (_, index) => index + 1),
  );

  /** Признак незавершённого анализа пометок. */
  const annotating = $derived(
    snapshot.annotationsSupported &&
      !snapshot.annotationsDone &&
      snapshot.annotationsProcessed > 0,
  );

  /** Заказ недостающих миниатюр при открытой вкладке страниц.
   *
   * Заказываются только страницы без картинки и в пределах уже открытого куска
   * списка: у книги на тысячи страниц заказ всей книги сразу перегрузил бы
   * модуль рисования. Прокрутка списка расширяет кусок, и недостающие миниатюры
   * дорисовываются. Модуль отвечает порциями по мере готовности.
   */
  $effect(() => {
    if (activeTab !== 'pages' || !snapshot.thumbnails) {
      return;
    }
    const missing = pageNumbers
      .filter((page) => page <= requestedUntil && !snapshot.thumbs[page])
      .slice(0, 48);
    if (missing.length > 0) {
      onRequestThumbs?.(missing, THUMB_WIDTH);
    }
  });

  /** Догрузка превью при прокрутке списка страниц. */
  function handlePagesScroll() {
    const list = pagesListEl;
    if (!list || activeTab !== 'pages') {
      return;
    }
    const nearEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - list.clientHeight;
    if (nearEnd && requestedUntil < (snapshot.pageCount ?? 0)) {
      requestedUntil = Math.min(
        (snapshot.pageCount ?? 0),
        requestedUntil + THUMB_PAGE_STEP,
      );
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

<SidePanel
  title={t('app.properties.title')}
  testId="properties-panel"
  side="left"
  showSearch={activeTab === 'contents' || activeTab === 'bookmarks' || activeTab === 'annotations'}
  class="w-[var(--properties-panel-width)]"
  {onClose}
>
  {#snippet search()}
    <Input
      bind:value={query}
      placeholder={t('app.properties.search')}
      ariaLabel={t('app.properties.search')}
      icon="search"
      clearable
    />
  {/snippet}

  {#if tabs.length === 0}
    <div class="p-4" data-testid="properties-empty">
      <EmptyState
        icon="book"
        title={t('app.properties.empty.title')}
        description={t('app.properties.empty.description')}
      />
    </div>
  {:else}
    <!--
      Состав вкладок зависит от формата книги: содержание есть у текучих книг,
      закладки — у страничных, превью и встроенные пометки — у тех форматов,
      которые умеют их разбирать.
    -->
    <div
      class="flex flex-wrap gap-0.5 border-b border-[var(--border)] bg-[var(--panel)] p-1.5"
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
        <div
          class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 p-2"
          data-testid="properties-pages"
        >
          {#each pageNumbers as page (page)}
            <button
              type="button"
              class="flex cursor-pointer flex-col items-center gap-1 rounded-[var(--radius)] p-1 transition-colors {currentPage ===
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
                  class="max-h-[8rem] w-full rounded-[0.25rem] border border-[var(--border)] object-contain"
                />
              {:else}
                <span
                  class="flex w-full items-center justify-center rounded-[0.25rem] border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
                  style="height: 8rem;"
                  data-testid="properties-page-pending"
                >
                  <Icon name="book" />
                </span>
              {/if}
              <span class="role-caption text-[var(--muted-foreground)]">{page}</span>
            </button>
          {/each}
        </div>
      {:else if activeTab === 'annotations'}
        <div class="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
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
        <ul class="m-0 list-none p-1" data-testid="properties-annotations">
          {#each annotations as annotation (annotation.id)}
            <li>
              <button
                type="button"
                class="flex w-full cursor-pointer flex-col gap-1 rounded-[var(--radius)] px-2 py-2 text-left transition-colors {shownId ===
                annotation.id
                  ? 'bg-[var(--surface-selected)]'
                  : 'hover:bg-[var(--surface-hover)]'}"
                aria-pressed={shownId === annotation.id}
                data-testid="properties-annotation-row"
                onclick={() => toggleAnnotation(annotation)}
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
        <p class="px-3 pb-3 role-caption text-[var(--muted-foreground)]">
          {t('app.properties.annotations.hint')}
        </p>
      {/if}
    </div>
  {/if}
</SidePanel>
