<script lang="ts">
  import { t } from '@context/i18n';
  import {
    ActionMenu,
    Button,
    ColorPicker,
    Icon,
    Input,
    Popover,
    type ColorSwatch,
    type MenuAction,
  } from '@context/ui';
  import { hotkeyHint } from '../hotkeys/registry';
  import {
    NOTE_COLORS,
    NOTE_COLOR_SWATCHES,
    NOTE_TYPES,
    noteColorLabel,
    noteTypeLabel,
    SHAPE_KINDS,
    shapeKindLabel,
    type NoteColor,
    type NoteTool,
    type NoteType,
    type ShapeKind,
  } from '../notes/notes';
  import type { PropertiesTabId } from './file-properties';

  /**
   * Строка книги — управление чтением под текстом.
   *
   * Строка стоит под панелями и книгой во всю ширину рабочего места, поэтому
   * открытие панели не меняет её места и не сдвигает кнопки из-под курсора.
   *
   * Порядок — по тому, как читают: слева меню и действия над текстом (поиск,
   * инструмент заметки, шрифт), справа — управление положением и видом книги
   * (страницы или прогресс, масштаб, тема). Ближе к правому краю то, что
   * меняют реже.
   */

  interface Props {
    /** Поддерживает ли формат страницы. */
    pages?: boolean;
    /** Текущая страница или `null`. */
    page?: number | null;
    /** Общее число страниц или `null`. */
    pageCount?: number | null;
    /** Прогресс чтения в процентах (у страничных не показывается). */
    progress?: number;
    /** Текущий масштаб в процентах. */
    zoom?: number;
    /** Нижняя граница масштаба. */
    minZoom?: number;
    /** Верхняя граница масштаба. */
    maxZoom?: number;
    /** Поддерживает ли формат изменение масштаба. */
    showZoom?: boolean;
    /** Текущая тема области чтения. */
    readerTheme?: 'light' | 'dark';
    /** Переключение темы области чтения. */
    onToggleTheme?: () => void;
    /** Применима ли гарнитура книги (текучий текст). */
    fontAvailable?: boolean;
    /** Текущая гарнитура книги. */
    readerFont?: 'serif' | 'sans';
    /** Переключение гарнитуры книги. */
    onToggleFont?: () => void;
    /** Открыта ли панель поиска по книге. */
    searchOpen?: boolean;
    /** Переключение поиска по книге. */
    onToggleSearch?: () => void;
    /** Активный инструмент создания заметок. */
    tool?: NoteTool;
    /** Доступные формату типы заметок; один тип — переключать нечего. */
    allowedTypes?: readonly NoteType[];
    /** Смена инструмента заметок. */
    onToolChange?: (tool: NoteTool) => void;
    /** Доступные разделы панели книги. */
    dockTabs?: readonly PropertiesTabId[];
    /** Открытие раздела панели книги. */
    onOpenDockTab?: (tab: PropertiesTabId) => void;
    /** Открытие панели открытых вкладок. */
    onOpenBooks?: () => void;
    /** Переход к соседней странице. */
    onStepPage?: (delta: number) => void;
    /** Переход к введённому номеру страницы. */
    onGoToPage?: (page: number) => void;
    /** Изменение масштаба на шаг шкалы. */
    onStepZoom?: (direction: 1 | -1) => void;
  }

  let {
    pages = false,
    page = null,
    pageCount = null,
    progress = 0,
    zoom = 100,
    minZoom = 60,
    maxZoom = 220,
    showZoom = true,
    readerTheme = 'light',
    onToggleTheme,
    fontAvailable = false,
    readerFont = 'serif',
    onToggleFont,
    searchOpen = false,
    onToggleSearch,
    tool,
    allowedTypes = NOTE_TYPES,
    onToolChange,
    dockTabs = [],
    onOpenDockTab,
    onOpenBooks,
    onStepPage,
    onGoToPage,
    onStepZoom,
  }: Props = $props();

  /** Ширина строки: по ней убираются второстепенные действия, но строка не переносится. */
  let barWidth = $state(0);

  /** Элемент строки для измерения ширины. */
  let bar: HTMLDivElement | undefined = $state();

  /** Узко: поиск и шрифт уходят в меню; номер страницы становится подписью. */
  const narrow = $derived(barWidth > 0 && barWidth < 34 * 16);

  /** Слежение за шириной строки. */
  $effect(() => {
    const el = bar;
    if (!el) {
      return;
    }
    let frame = 0;
    const apply = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        barWidth = el.clientWidth;
      });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  /** Черновик поля номера страницы; `null` — поле показывает текущую страницу. */
  let pageDraft = $state<string | null>(null);

  /** Видимое значение поля страницы. */
  const pageValue = $derived(pageDraft ?? (page === null ? '' : String(page)));

  /** Состояние поповера инструмента заметок. */
  let toolOpen = $state(false);

  /** Названия разделов панели книги. */
  const DOCK_LABELS: Record<PropertiesTabId, string> = $derived({
    contents: t('app.properties.contents'),
    search: t('app.bookDock.search'),
    bookmarks: t('app.properties.bookmarks'),
    pages: t('app.properties.pages'),
    annotations: t('app.properties.annotations'),
  });

  /** Пункты меню: разделы книги, вкладки и то, что не влезло в строку. */
  const moreItems = $derived<MenuAction[]>([
    ...(['contents', 'search', 'bookmarks', 'pages', 'annotations'] as PropertiesTabId[])
      .filter((id) => dockTabs.includes(id))
      .map((id) => ({ id: `dock:${id}`, label: DOCK_LABELS[id] })),
    ...(narrow && onToggleSearch
      ? [
          {
            id: 'search',
            label: t('app.reader.searchShort'),
            icon: 'search' as const,
            separatorBefore: true,
          },
        ]
      : []),
    ...(narrow && fontAvailable && onToggleFont
      ? [
          {
            id: 'font',
            label: readerFont === 'serif' ? t('app.font.toSans') : t('app.font.toSerif'),
            icon: 'text' as const,
          },
        ]
      : []),
    ...(onOpenBooks
      ? [
          {
            id: 'books',
            label: t('app.workplace.openBooks'),
            icon: 'tabs' as const,
            separatorBefore: true,
          },
        ]
      : []),
  ]);

  /** Выполнение пункта меню. */
  function runMore(id: string) {
    if (id.startsWith('dock:')) {
      onOpenDockTab?.(id.slice(5) as PropertiesTabId);
      return;
    }
    switch (id) {
      case 'search':
        onToggleSearch?.();
        break;
      case 'font':
        onToggleFont?.();
        break;
      case 'books':
        onOpenBooks?.();
        break;
    }
  }

  /** Переход к введённому номеру страницы. */
  function commitPage() {
    const draft = pageDraft?.trim();
    if (draft !== undefined && draft !== '') {
      const value = Number(draft);
      if (Number.isInteger(value) && value >= 1) {
        onGoToPage?.(value);
      }
    }
    pageDraft = null;
  }

  /** Подпись кнопки темы: называет сторону, на которую она переключит. */
  const themeTitle = $derived(
    readerTheme === 'dark' ? t('app.theme.reader.toLight') : t('app.theme.reader.toDark'),
  );

  /** Доступное имя кнопки темы: называет текущую сторону, как у значка. */
  const themeLabel = $derived(
    readerTheme === 'dark' ? t('app.theme.reader.light') : t('app.theme.reader.dark'),
  );

  /** Подпись кнопки гарнитуры. */
  const fontTitle = $derived(
    readerFont === 'serif' ? t('app.font.switchToSans') : t('app.font.switchToSerif'),
  );

  /** Есть ли что выбирать в инструменте заметок. */
  const toolChoosable = $derived(allowedTypes.length > 1 && tool !== undefined);

  /** Доступные типы в порядке панели. */
  const typeOptions = $derived(NOTE_TYPES.filter((type) => allowedTypes.includes(type)));

  /** Образцы цвета заметки. */
  const colorSwatches = $derived<ColorSwatch[]>(
    NOTE_COLORS.map((color) => ({
      id: color,
      label: noteColorLabel(color),
      value: NOTE_COLOR_SWATCHES[color],
      selected: tool?.color === color,
    })),
  );

  /** Выбор типа заметки. */
  function selectType(type: NoteType) {
    if (tool && type !== tool.type) {
      onToolChange?.({ ...tool, type });
    }
  }

  /** Выбор вида фигуры. */
  function selectShape(shape: ShapeKind) {
    if (tool) {
      onToolChange?.({ ...tool, shape });
    }
  }

  /** Выбор цвета заметки. */
  function selectColor(color: NoteColor) {
    if (tool && color !== tool.color) {
      onToolChange?.({ ...tool, color });
    }
  }
</script>

<div
  bind:this={bar}
  class="flex h-[var(--book-bar-height)] flex-none flex-nowrap items-center gap-1.5 overflow-hidden bg-[var(--card)] px-2 text-sm [font-variant-numeric:tabular-nums]"
  data-testid="book-bar"
  role="toolbar"
  aria-label={t('app.bookBar.label')}
>
  <!--
    Слева — действия над текстом книги: меню, поиск, инструмент заметки и
    гарнитура. Это то, что делают с текстом, поэтому группа стоит у начала
    строки, где её ищут.
  -->
  <ActionMenu
    items={moreItems}
    onselect={runMore}
    ariaLabel={t('app.bookBar.more')}
    title={t('app.bookBar.more')}
    testId="book-bar-more"
    class="size-9"
  />

  {#if onToggleSearch && !narrow}
    <Button
      size="icon"
      variant={searchOpen ? 'primary' : 'ghost'}
      title={hotkeyHint('reader.search', t('app.reader.searchShort'))}
      ariaLabel={t('app.reader.searchShort')}
      ariaPressed={searchOpen}
      testId="reader-search-toggle"
      onclick={onToggleSearch}
    >
      <Icon name="search" />
    </Button>
  {/if}

  {#if toolChoosable && tool}
    <Popover bind:open={toolOpen} side="top" align="start" class="w-[15rem]" testId="book-tool-menu">
      {#snippet trigger({ props })}
        <button
          type="button"
          {...props}
          class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors hover:bg-[var(--surface-hover)] {tool.type ===
 'quote'
 ? 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
 : 'bg-[var(--primary)] text-[var(--primary-foreground)]'}"
          title={t('app.bookBar.tool')}
          aria-label={t('app.bookBar.tool')}
          aria-pressed={tool.type !== 'quote'}
          data-testid="book-bar-tool"
        >
          <Icon name="pencil" />
        </button>
      {/snippet}
      <div class="flex flex-col gap-2">
        <div
          class="flex items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
          role="group"
          aria-label={t('app.note.typeLabel')}
        >
          {#each typeOptions as type (type)}
            <Button
              variant={tool.type === type ? 'primary' : 'ghost'}
              size="sm"
              title={noteTypeLabel(type)}
              ariaLabel={noteTypeLabel(type)}
              ariaPressed={tool.type === type}
              class="flex-1"
              onclick={() => selectType(type)}
            >
              <Icon name={type} />
            </Button>
          {/each}
        </div>
        {#if tool.type === 'shape' && typeOptions.includes('shape')}
          <div
            class="flex items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
            role="group"
            aria-label={t('app.note.shapeLabel')}
            data-testid="note-tool-shape"
          >
            {#each SHAPE_KINDS as shape (shape)}
              <Button
                variant={tool.shape === shape ? 'primary' : 'ghost'}
                size="sm"
                title={shapeKindLabel(shape)}
                ariaLabel={shapeKindLabel(shape)}
                ariaPressed={tool.shape === shape}
                class="flex-1"
                onclick={() => selectShape(shape)}
              >
                <Icon name="shape" />
              </Button>
            {/each}
          </div>
          <ColorPicker
            colors={colorSwatches}
            onpick={(id) => selectColor(id as NoteColor)}
            ariaLabel={t('app.note.colorMenuLabel')}
            testIdPrefix="note-tool-color"
            size="sm"
          />
        {/if}
      </div>
    </Popover>
  {/if}

  {#if fontAvailable && onToggleFont && !narrow}
    <Button
      size="icon"
      variant="ghost"
      title={fontTitle}
      ariaLabel={fontTitle}
      testId="reader-font-toggle"
      onclick={onToggleFont}
    >
      <span
        class="text-base leading-none"
        style="font-family: {readerFont === 'serif'
          ?"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
          :"Georgia, 'Times New Roman', serif"}"
        aria-hidden="true">Аа</span
      >
    </Button>
  {/if}

  <div class="min-w-0 flex-1"></div>

  <!--
    Справа — положение и вид книги: страницы или прогресс, масштаб, тема.
    Прогресс текучей книги стоит там же, где у страничной номер страницы:
    это одно и то же место «где я», просто у текучей книги его нечем считать
    по страницам.
  -->
  {#if pages && page !== null}
    <div
      class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
      data-testid="reader-pages"
    >
      <Button
        size="icon"
        variant="ghost"
        title={t('app.reader.prevPage')}
        ariaLabel={t('app.reader.prevPage')}
        class="size-8"
        disabled={page <= 1}
        onclick={() => onStepPage?.(-1)}
      >
        <Icon name="chevron-up" />
      </Button>
      {#if narrow}
        <span class="px-1 text-sm whitespace-nowrap" data-testid="reader-page-count">
          {page} / {pageCount ?? '?'}
        </span>
      {:else}
        <Input
          class="h-8 w-[calc(var(--spacing)*14)] shrink-0 border-0 bg-transparent px-1 py-0 text-right text-sm"
          ariaLabel={t('app.reader.currentPage')}
          value={pageValue}
          oninput={(event) => (pageDraft = event.currentTarget.value)}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              commitPage();
            }
          }}
          onblur={commitPage}
        />
        <span
          class="inline-block min-w-[calc(var(--spacing)*12)] shrink-0 pr-2 whitespace-nowrap text-left text-sm"
          data-testid="reader-page-count"
          >/ {pageCount ?? '?'}</span
        >
      {/if}
      <Button
        size="icon"
        variant="ghost"
        title={t('app.reader.nextPage')}
        ariaLabel={t('app.reader.nextPage')}
        class="size-8"
        disabled={pageCount !== null && page >= pageCount}
        onclick={() => onStepPage?.(1)}
      >
        <Icon name="chevron-down" />
      </Button>
    </div>
  {:else}
    <!--
      Прогресс показывается у книг без страниц, в том числе пока формат ещё не
      сообщил свои возможности: это место «где я», и пустым оно быть не должно.
    -->
    <span
      class="inline-block w-[calc(var(--spacing)*11)] shrink-0 text-right whitespace-nowrap text-sm text-[var(--muted-foreground)]"
      data-testid="reader-progress"
      >{Math.round(progress)}%</span
    >
  {/if}

  {#if showZoom}
    <div
      class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
      data-testid="reader-zoom-group"
    >
      <Button
        size="icon"
        variant="ghost"
        title={hotkeyHint('reader.zoom.out', t('app.reader.zoomOut'))}
        ariaLabel={t('app.reader.zoomOut')}
        class="size-8"
        disabled={zoom <= minZoom}
        onclick={() => onStepZoom?.(-1)}>−</Button
      >
      <Button
        size="icon"
        variant="ghost"
        title={hotkeyHint('reader.zoom.in', t('app.reader.zoomIn'))}
        ariaLabel={t('app.reader.zoomIn')}
        class="size-8"
        disabled={zoom >= maxZoom}
        onclick={() => onStepZoom?.(1)}>+</Button
      >
      <span class="inline-block w-[calc(var(--spacing)*13)] text-center text-sm" data-testid="reader-zoom"
        >{zoom}%</span
      >
    </div>
  {/if}

  {#if onToggleTheme}
    <Button
      size="icon"
      variant="ghost"
      title={themeTitle}
      ariaLabel={themeLabel}
      testId="reader-theme-toggle"
      onclick={onToggleTheme}
    >
      <Icon name={readerTheme === 'dark' ? 'sun' : 'moon'} />
    </Button>
  {/if}</div>
