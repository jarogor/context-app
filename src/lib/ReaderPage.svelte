<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button, Progress, Spinner } from '@texture/ui';
  import BookReader from './BookReader.svelte';
  import WorkplaceContent from './WorkplaceContent.svelte';
  import {
    UnsupportedFormatError,
    formatFromPath,
    isSupportedFormat,
    loadBookContent,
    openBookExternally,
    selectWorkplacePlugin,
    type BookContent,
    type WorkplaceSelection,
  } from './reader';
  import type { Note } from './notes';
  import type { QuoteAnchor } from './reader/anchor';
  import { canStepPage, clampPage, pageProgress } from './reader/page-state';

  interface Props {
    /** Путь к файлу открытой книги (вложение вкладки). */
    path: string;
    /** Название открытой книги. */
    title: string;
    /** Начальный масштаб чтения в процентах. */
    initialZoom?: number;
    /** Начальная позиция чтения в процентах. */
    initialPosition?: number;
    /** Видима ли поверхность рабочего места. */
    visible?: boolean;
    /** Заметки-цитаты книги для подсветки. */
    notes?: Note[];
    /** Сообщение об изменении состояния чтения вкладки. */
    onStateChange?: (state: { zoom: number; position: number }) => void;
    /** Выделение пользователя, ставшее цитатой. */
    onQuote?: (anchor: QuoteAnchor) => void;
    /** Просьба указать файл недоступной книги. */
    onRepoint?: () => void;
    /** Клик по подсветке заметки: открыть панель и выбрать заметку. */
    onNoteClick?: (noteId: string) => void;
    /** Убрать вкладку. */
    onRemove?: () => void;
  }

  let {
    path,
    title,
    initialZoom = 100,
    initialPosition = 0,
    visible = true,
    notes = [],
    onStateChange,
    onQuote,
    onRepoint,
    onNoteClick,
    onRemove,
  }: Props = $props();

  /** Минимальный и максимальный масштаб текста в процентах. */
  const TEXT_MIN_ZOOM = 60;
  const TEXT_MAX_ZOOM = 220;
  /** Минимальный и максимальный масштаб страничного формата в процентах.
   *
   * Страницы измеряются собственной шкалой файла, поэтому диапазон шире: от
   * почти нечитаемого обзора до сильного увеличения фрагмента.
   */
  const PAGE_MIN_ZOOM = 5;
  const PAGE_MAX_ZOOM = 1000;

  /** Содержимое книги (текстовые форматы). */
  let content: BookContent | null = $state(null);
  /** Плагин рабочего места, если формат читается им. */
  let workplace: WorkplaceSelection | null = $state(null);
  /** Идёт загрузка содержимого. */
  let loading = $state(true);
  /** Ошибка загрузки содержимого. */
  let error: string | null = $state(null);
  /** Формат не поддерживается встроенным чтением. */
  let unsupported = $state(false);
  /** Книга недоступна: файл не читается или не найден. */
  let unavailable = $state(false);
  /** Масштаб текста в процентах (начальное значение берётся один раз). */
  let zoom = $state(untrack(() => initialZoom));
  /** Прогресс чтения в процентах. */
  let progress = $state(untrack(() => initialPosition));
  /** Поддерживает ли плагин рабочего места изменение масштаба. */
  let workplaceZoom = $state(true);
  /** Поддерживает ли плагин рабочего места страницы. */
  let workplacePages = $state(false);
  /** Прогресс загрузки содержимого плагина в процентах. */
  let loadProgress = $state<number | null>(null);
  /** Действующие границы масштаба: шире для страничных форматов. */
  const minZoom = $derived(workplacePages ? PAGE_MIN_ZOOM : TEXT_MIN_ZOOM);
  const maxZoom = $derived(workplacePages ? PAGE_MAX_ZOOM : TEXT_MAX_ZOOM);
  /** Текущая страница плагина рабочего места. */
  let workplacePage = $state<number | null>(null);
  /** Общее число страниц плагина рабочего места. */
  let workplacePageCount = $state<number | null>(null);
  /** Введённый номер страницы для перехода. */
  let pageInput = $state('');
  /** Читалка текстовой книги для перехода к заметке. */
  let reader: { goto: (note: Note) => void } | undefined = $state();
  /** Область содержимого плагина для перехода к странице и заметке. */
  let workplaceContent:
    | { gotoPage: (page: number) => void; gotoAnchor: (anchor: string, noteId?: string) => void }
    | undefined = $state();
  /** Незавершённый якорь выделения для создания заметки. */
  let pendingAnchor: QuoteAnchor | null = $state(null);
  /** Позиция меню создания заметки. */
  let menuPosition: { x: number; y: number } | null = $state(null);
  /** Ширина области содержимого: по ней ограничивается позиция меню. */
  let readerAreaWidth = $state(0);
  /** Высота области содержимого: по ней меню переносится выше выделения. */
  let readerAreaHeight = $state(0);

  /** Позиция меню создания заметки внутри области содержимого.
   *
   * Координаты выделения приходят из области содержимого и уже заданы от её
   * верхнего левого угла; ограничение держит меню внутри области и над краем.
   */
  function quoteMenuStyle(): string {
    const width = readerAreaWidth;
    const height = readerAreaHeight;
    const menuWidth = 190;
    const menuHeight = 40;
    const x = Math.max(8, Math.min(menuPosition?.x ?? 0, Math.max(8, width - menuWidth - 8)));
    const preferred = (menuPosition?.y ?? 0) + 6;
    const y =
      height > 0 && preferred + menuHeight > height
        ? Math.max(8, (menuPosition?.y ?? 0) - menuHeight - 6)
        : preferred;
    return `left: ${x}px; top: ${y}px;`;
  }

  /** Сообщение об изменении состояния чтения вкладки. */
  function reportState() {
    onStateChange?.({ zoom, position: progress });
  }

  /** Переход к введённому номеру страницы. */
  function goToPageInput() {
    const page = Number(pageInput);
    if (Number.isFinite(page) && page >= 1) {
      workplaceContent?.gotoPage(clampPage(page, workplacePageCount));
    }
    pageInput = '';
  }

  /** Переход к соседней странице с учётом границ. */
  function stepPage(delta: number) {
    if (workplacePage !== null && canStepPage(workplacePage, workplacePageCount, delta)) {
      workplaceContent?.gotoPage(workplacePage + delta);
    }
  }

  /** Создание заметки-цитаты по выделению на странице. */
  function confirmWorkplaceQuote() {
    const anchor = pendingAnchor;
    dismissWorkplaceMenu();
    if (anchor) {
      onQuote?.(anchor);
    }
  }

  /** Отмена меню создания заметки. */
  function dismissWorkplaceMenu() {
    pendingAnchor = null;
    menuPosition = null;
  }

  /** Загрузка содержимого книги.
   *
   * Рабочее место не знает, откуда книга: файл читается ядром по пути. Если
   * файл не найден или не читается, вкладка предлагает указать файл заново, а
   * не завершает работу.
   */
  async function load(value: string) {
    loading = true;
    error = null;
    unsupported = false;
    unavailable = false;
    content = null;
    workplace = null;
    try {
      const format = formatFromPath(value);
      if (!format) {
        unsupported = true;
        return;
      }
      if (isSupportedFormat(format)) {
        content = await loadBookContent(value);
      } else {
        const selection = await selectWorkplacePlugin(value);
        if (selection) {
          workplace = selection;
        } else {
          unsupported = true;
        }
      }
    } catch (e) {
      if (e instanceof UnsupportedFormatError) {
        unsupported = true;
      } else {
        unavailable = true;
        error = String(e);
      }
    } finally {
      loading = false;
    }
  }

  /** Изменение масштаба текста в допустимых границах. */
  function changeZoom(delta: number) {
    zoom = Math.max(minZoom, Math.min(maxZoom, zoom + delta));
    reportState();
  }

  /** Открытие файла книги в системном приложении. */
  async function openInSystem() {
    error = null;
    try {
      await openBookExternally(path);
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => {
    void load(path);
  });

  /** Переход к месту заметки в тексте книги.
   *
   * Используется панелью заметок: чтение возвращается к выделению заметки.
   */
  export function goto(note: Note) {
    reader?.goto(note);
    if (workplace) {
      workplaceContent?.gotoAnchor(note.anchor, note.id);
    }
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="min-h-0 flex-1 overflow-hidden">
    {#if loading}
      <div
        class="flex h-full items-center justify-center gap-2 text-[var(--muted-foreground)]"
        data-testid="reader-loading"
      >
        <Spinner />
        <span>Открытие книги…</span>
      </div>
    {:else if unavailable}
      <div
        class="mx-auto max-w-[560px] p-6 text-center"
        data-testid="reader-unavailable"
      >
        <p class="mb-2 font-semibold">{title}</p>
        <p class="mb-4 text-[var(--muted-foreground)]">
          Книга недоступна: возможно, файл перемещён или переименован.
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          {#if onRepoint}
            <Button variant="primary" onclick={onRepoint}>Указать файл</Button>
          {/if}
          {#if onRemove}
            <Button variant="ghost" onclick={onRemove}>Убрать вкладку</Button>
          {/if}
        </div>
      </div>
    {:else if unsupported}
      <div class="mx-auto max-w-[560px] p-6 text-center">
        <p class="mb-4">
          Формат этой книги пока не поддерживается встроенным чтением.
        </p>
        <Button variant="secondary" onclick={openInSystem}>Открыть в системе</Button>
      </div>
    {:else if error}
      <div class="mx-auto max-w-[560px] p-6 text-center">
        <p class="mb-3 text-[var(--destructive)]" data-testid="reader-error">
          Не удалось открыть книгу: {error}
        </p>
        {#if onRemove}
          <Button variant="ghost" onclick={onRemove}>Убрать вкладку</Button>
        {/if}
      </div>
    {:else if workplace}
      <div
        class="relative h-full w-full"
        bind:clientWidth={readerAreaWidth}
        bind:clientHeight={readerAreaHeight}
      >
        {#if loadProgress !== null}
          <div
            class="pointer-events-none absolute inset-x-0 top-0 z-20"
            data-testid="reader-load-progress"
          >
            <Progress value={loadProgress} />
          </div>
        {/if}
        <WorkplaceContent
          bind:this={workplaceContent}
          pluginId={workplace.pluginId}
          {path}
          {title}
          {zoom}
          initialPosition={initialPosition}
          {notes}
          onCapabilities={(value) => {
            workplaceZoom = value.zoom !== false;
            workplacePages = value.pages === true;
          }}
          onLoadProgress={(value) => (loadProgress = value)}
          onState={(value) => {
            workplacePage = value.page;
            workplacePageCount = value.pages;
            if (value.pages && value.page) {
              progress = pageProgress(value.page, value.pages);
              reportState();
            }
          }}
          onProgress={(value) => {
            progress = value;
            reportState();
          }}
          onSelection={(anchor, position) => {
            pendingAnchor = anchor;
            menuPosition = position;
          }}
          onSelectionCleared={dismissWorkplaceMenu}
          onNoteClick={(noteId) => onNoteClick?.(noteId)}
          onError={(value) => (error = value)}
        />
        {#if menuPosition && pendingAnchor}
          <div
            class="absolute z-10 flex items-center gap-1 rounded-md border border-[var(--input)] bg-[var(--card)] p-[4px] shadow-lg"
            data-testid="quote-menu"
            style={quoteMenuStyle()}
          >
            <Button variant="primary" size="sm" onclick={confirmWorkplaceQuote}>Создать заметку</Button>
            <Button variant="ghost" size="sm" onclick={dismissWorkplaceMenu}>Отмена</Button>
          </div>
        {/if}
      </div>
    {:else if content}
      <BookReader
        bind:this={reader}
        {content}
        {zoom}
        {initialPosition}
        {notes}
        {visible}
        onQuote={(anchor) => onQuote?.(anchor)}
        onSelectNote={(noteId) => onNoteClick?.(noteId)}
        onProgress={(value) => {
          progress = value;
          reportState();
        }}
      />
    {/if}
  </div>

  <footer
    class="flex flex-[0_0_40px] items-center gap-4 border-t border-[var(--border)] bg-[var(--card)] px-4 text-[12px] text-[var(--muted-foreground)]"
  >
    <div class="flex items-center gap-1">
      {#if !workplace || workplaceZoom}
        <Button
          size="icon"
          variant="ghost"
          title="Уменьшить масштаб"
          ariaLabel="Уменьшить масштаб"
          disabled={zoom <= minZoom}
          onclick={() => changeZoom(-10)}>−</Button
        >
        <span class="min-w-[48px] text-center" data-testid="reader-zoom">{zoom}%</span>
        <Button
          size="icon"
          variant="ghost"
          title="Увеличить масштаб"
          ariaLabel="Увеличить масштаб"
          disabled={zoom >= maxZoom}
          onclick={() => changeZoom(10)}>+</Button
        >
      {/if}
    </div>
    <div class="ml-auto flex items-center gap-2">
      {#if workplace && workplacePages && workplacePage !== null}
        <div class="flex items-center gap-1" data-testid="reader-pages">
          <Button
            size="icon"
            variant="ghost"
            title="Предыдущая страница"
            ariaLabel="Предыдущая страница"
            disabled={workplacePage <= 1}
            onclick={() => stepPage(-1)}>‹</Button
          >
          <span class="min-w-[16px] text-center" data-testid="reader-page">{workplacePage}</span>
          <span data-testid="reader-page-count">из {workplacePageCount ?? '?'}</span>
          <input
            class="w-[52px] rounded-sm border border-[var(--border)] bg-[var(--card)] px-[6px] py-[2px] text-center text-[12px] text-[var(--foreground)]"
            aria-label="Перейти к странице"
            placeholder="№"
            bind:value={pageInput}
            onkeydown={(event) => {
              if (event.key === 'Enter') {
                goToPageInput();
              }
            }}
            onblur={goToPageInput}
          />
          <Button
            size="icon"
            variant="ghost"
            title="Следующая страница"
            ariaLabel="Следующая страница"
            disabled={workplacePageCount !== null && workplacePage >= workplacePageCount}
            onclick={() => stepPage(1)}>›</Button
          >
        </div>
      {/if}
      <span data-testid="reader-progress">{Math.round(progress)}%</span>
      <Progress value={progress} class="w-[180px]" />
    </div>
  </footer>
</div>
