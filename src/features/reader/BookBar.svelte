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
  import { zoomPresetsIn } from './zoom';

  /**
   * Строка книги — постоянное управление чтением под текстом.
   *
   * Здесь только то, что нужно всегда: где я в книге и как листать. Всё редкое
   * (оформление, шрифт, тема) и режимное (инструмент заметок) уходит во
   * всплывающие панели, а разделы книги — в правую доку. Поэтому высота строки
   * постоянна у всех форматов и при любом наборе инструментов: появление нового
   * инструмента не сдвигает книгу и не переносит строку на второй ряд.
   *
   * Состав строки зависит от возможностей формата: у страничной книги — переход
   * по страницам и номер, у текучей — прогресс и шкала. Это не ветка «если PDF»,
   * а два вида одного места «где я», которое выбирается по `pages`.
   *
   * Строка не переносится никогда: она идёт одной линией, а середина («где я»)
   * сжимается первой. Панели перекрывают книгу раньше, чем строке перестаёт
   * хватать места, поэтому до сжатия дело доходит только на очень узком окне.
   */

  interface Props {
    /** Текучая ли книга: текст течёт по колонке, страниц нет. */
    flowing?: boolean;
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
    /** Текущий инструмент создания заметок. */
    tool?: NoteTool;
    /** Доступные формату типы заметок; один тип — переключать нечего. */
    allowedTypes?: readonly NoteType[];
    /** Смена инструмента заметок. */
    onToolChange?: (tool: NoteTool) => void;
    /** Текущая тема области чтения. */
    readerTheme?: 'light' | 'dark';
    /** Переключение темы области чтения. */
    onToggleTheme?: () => void;
    /** Текущая гарнитура книги. */
    readerFont?: 'serif' | 'sans';
    /** Переключение гарнитуры книги. */
    onToggleFont?: () => void;
    /** Открыта ли панель поиска по книге. */
    searchOpen?: boolean;
    /** Открытие поиска по книге. */
    onOpenSearch?: () => void;
    /** Открыта ли левая панель заметок. */
    notesOpen?: boolean;
    /** Переключение левой панели заметок. */
    onToggleNotes?: () => void;
    /** Открыта ли правая панель книги. */
    dockOpen?: boolean;
    /** Переключение правой панели книги. */
    onToggleDock?: () => void;
    /** Открытие раздела правой панели. */
    onOpenDockTab?: (tab: PropertiesTabId) => void;
    /** Доступные разделы панели книги. */
    dockTabs?: readonly PropertiesTabId[];
    /** Открытие панели открытых книг. */
    onOpenBooks?: () => void;
    /** Переход к соседней странице. */
    onStepPage?: (delta: number) => void;
    /** Переход к введённому номеру страницы. */
    onGoToPage?: (page: number) => void;
    /** Изменение масштаба на шаг шкалы. */
    onStepZoom?: (direction: 1 | -1) => void;
    /** Установка масштаба значением. */
    onSetZoom?: (value: number) => void;
  }

  let {
    flowing = false,
    pages = false,
    page = null,
    pageCount = null,
    progress = 0,
    zoom = 100,
    minZoom = 60,
    maxZoom = 220,
    showZoom = true,
    tool,
    allowedTypes = NOTE_TYPES,
    onToolChange,
    readerTheme = 'light',
    onToggleTheme,
    readerFont = 'serif',
    onToggleFont,
    searchOpen = false,
    onOpenSearch,
    notesOpen = false,
    onToggleNotes,
    dockOpen = false,
    onToggleDock,
    onOpenDockTab,
    dockTabs = [],
    onOpenBooks,
    onStepPage,
    onGoToPage,
    onStepZoom,
    onSetZoom,
  }: Props = $props();

  /** Черновик поля номера страницы; `null` — поле показывает текущую страницу. */
  let pageDraft = $state<string | null>(null);

  /** Видимое значение поля страницы. */
  const pageValue = $derived(pageDraft ?? (page === null ? '' : String(page)));

  /** Есть ли что выбирать в инструменте заметок. */
  const toolChoosable = $derived(allowedTypes.length > 1 && tool !== undefined);

  /** Доступные типы в порядке панели. */
  const typeOptions = $derived(NOTE_TYPES.filter((type) => allowedTypes.includes(type)));

  /** Названия разделов панели книги. */
  const DOCK_LABELS: Record<PropertiesTabId, string> = $derived({
    contents: t('app.properties.contents'),
    search: t('app.bookDock.search'),
    bookmarks: t('app.properties.bookmarks'),
    pages: t('app.properties.pages'),
    annotations: t('app.properties.annotations'),
  });

  /** Пресеты масштаба в действующих границах формата. */
  const zoomPresets = $derived(zoomPresetsIn(minZoom, maxZoom));

  /** Подпись кнопки темы: называет сторону, на которую она переключит. */
  const themeTitle = $derived(
    readerTheme === 'dark' ? t('app.theme.reader.toLight') : t('app.theme.reader.toDark'),
  );

  /** Подпись кнопки гарнитуры. */
  const fontTitle = $derived(
    readerFont === 'serif' ? t('app.font.switchToSans') : t('app.font.switchToSerif'),
  );

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

  /** Разделы панели книги в меню «Ещё». */
  const dockItems = $derived<MenuAction[]>(
    (['contents', 'search', 'bookmarks', 'pages', 'annotations'] as PropertiesTabId[])
      .filter((id) => dockTabs.includes(id))
      .map((id) => ({ id: `dock:${id}`, label: DOCK_LABELS[id] })),
  );

  /**
   * Пункты меню «Ещё»: разделы книги и открытые вкладки.
   *
   * Меню — единственное место в строке, которое растёт вместе с приложением:
   * новый раздел или служебное действие добавляются сюда, и высота строки от
   * этого не меняется.
   */
  const moreItems = $derived<MenuAction[]>([
    ...dockItems,
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

  /** Состояние поповеров строки. */
  let viewOpen = $state(false);
  let toolOpen = $state(false);

  /** Выполнение пункта меню «Ещё». */
  function runMore(id: string) {
    if (id.startsWith('dock:')) {
      onOpenDockTab?.(id.slice(5) as PropertiesTabId);
      return;
    }
    if (id === 'books') {
      onOpenBooks?.();
    }
  }
</script>

<div
  class="flex h-[var(--book-bar-height)] flex-none flex-nowrap items-center gap-1 overflow-hidden border-t border-[var(--border)] bg-[var(--card)] px-2 text-sm [font-variant-numeric:tabular-nums]"
  data-testid="book-bar"
  role="toolbar"
  aria-label={t('app.bookBar.label')}
>
  <!--
    Панели книги стоят по краям строки: заметки слева, разделы книги справа —
    там же, где стоят сами панели. Кнопка — переключатель, поэтому её нажатое
    состояние показывает, открыта ли панель.
  -->
  {#if onToggleNotes}
    <Button
      variant={notesOpen ? 'primary' : 'ghost'}
      size="icon"
      title={hotkeyHint('workplace.notes', t('app.workplace.notes'))}
      ariaLabel={t('app.workplace.notes')}
      ariaPressed={notesOpen}
      testId="workplace-notes-toggle"
      onclick={onToggleNotes}
    >
      <Icon name="note" />
    </Button>
  {/if}
  {#if onToggleDock}
    <Button
      variant={dockOpen ? 'primary' : 'ghost'}
      size="icon"
      title={hotkeyHint('workplace.properties', t('app.bookDock.title'))}
      ariaLabel={t('app.bookDock.title')}
      ariaPressed={dockOpen}
      testId="workplace-properties-toggle"
      onclick={onToggleDock}
    >
      <Icon name="layers" />
    </Button>
  {/if}

  <!--
    «Где я в книге». У страничной книги — переход и номер; у текучей — прогресс
    и шкала. Числовые элементы держат постоянную ширину, поэтому смена числа
    разрядов не двигает соседние кнопки. Шкала прогресса занимает остаток
    ширины и сжимается первой — вплоть до нуля.
  -->
  <div class="flex min-w-0 flex-1 items-center gap-1.5" data-testid="book-bar-place">
    {#if pages && page !== null}
      <div
        class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5"
        data-testid="reader-pages"
      >
        <button
          type="button"
          title={t('app.reader.prevPage')}
          aria-label={t('app.reader.prevPage')}
          disabled={page <= 1}
          class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
          onclick={() => onStepPage?.(-1)}
        >
          <Icon name="chevron-up" />
        </button>
        <Input
          class="h-7 w-[3.25rem] shrink-0 border-0 bg-card px-1 py-0 text-right text-sm"
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
          class="inline-block min-w-[2.75rem] shrink-0 pr-1 whitespace-nowrap text-left text-sm"
          data-testid="reader-page-count"
          >/ {pageCount ?? '?'}</span
        >
        <button
          type="button"
          title={t('app.reader.nextPage')}
          aria-label={t('app.reader.nextPage')}
          disabled={pageCount !== null && page >= pageCount}
          class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
          onclick={() => onStepPage?.(1)}
        >
          <Icon name="chevron-down" />
        </button>
      </div>
    {:else if flowing}
      <div class="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--primary-soft)]">
        <div
          class="h-full rounded-full bg-[var(--primary)] transition-[width] duration-200"
          style="width: {Math.max(0, Math.min(100, progress))}%"
        ></div>
      </div>
      <span
        class="inline-block w-[2.75rem] shrink-0 text-right text-sm text-[var(--muted-foreground)]"
        data-testid="reader-progress"
        >{Math.round(progress)}%</span
      >
    {/if}
  </div>

  <!--
    Инструмент заметок: у книги с одним доступным типом (текучий текст)
    переключать нечего, поэтому кнопки нет. Панель открывается вверх и не
    занимает места в строке.
  -->
  {#if toolChoosable && tool}
    <Popover bind:open={toolOpen} side="top" align="end" class="w-[15rem]">
      {#snippet trigger({ props })}
        <button
          type="button"
          {...props}
          class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors hover:bg-[var(--surface-hover)] {tool.type ===
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
          class="flex items-center gap-0.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5"
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
            class="flex items-center gap-0.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5"
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

  <!--
    «Вид» — единственная панель оформления: масштаб, гарнитура, тема области
    чтения. Они меняются редко и вместе, поэтому стоят в одном месте, а не
    тремя отдельными кнопками в постоянной строке.
  -->
  {#if showZoom || (flowing && onToggleFont) || onToggleTheme}
    <Popover bind:open={viewOpen} side="top" align="end" class="w-[16rem]">
      {#snippet trigger({ props })}
        <button
          type="button"
          {...props}
          class="flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded-[var(--radius)] px-1.5 text-sm tabular-nums text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
          title={hotkeyHint('reader.zoom.in', t('app.bookBar.view'))}
          aria-label={t('app.bookBar.view')}
          data-testid="reader-zoom"
        >
          {#if showZoom}
            {zoom}%
          {:else}
            <Icon name="focus" />
          {/if}
          <Icon name="chevron-up" class="h-3 w-3" />
        </button>
      {/snippet}
      <div class="flex flex-col gap-3" data-testid="reader-zoom-group">
        {#if showZoom}
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-[var(--muted-foreground)]">{t('app.reader.zoomIn')}</span>
            <div class="flex items-center gap-1">
              <Button
                size="icon"
                variant="secondary"
                title={hotkeyHint('reader.zoom.out', t('app.reader.zoomOut'))}
                ariaLabel={t('app.reader.zoomOut')}
                class="flex-1"
                disabled={zoom <= minZoom}
                onclick={() => onStepZoom?.(-1)}>−</Button
              >
              <span class="w-14 shrink-0 text-center text-sm tabular-nums">{zoom}%</span>
              <Button
                size="icon"
                variant="secondary"
                title={hotkeyHint('reader.zoom.in', t('app.reader.zoomIn'))}
                ariaLabel={t('app.reader.zoomIn')}
                class="flex-1"
                disabled={zoom >= maxZoom}
                onclick={() => onStepZoom?.(1)}>+</Button
              >
            </div>
            <div class="flex flex-wrap gap-1">
              {#each zoomPresets as preset (preset)}
                <Button
                  size="sm"
                  variant={zoom === preset ? 'primary' : 'secondary'}
                  title={t('app.bookBar.zoomPreset', { value: preset })}
                  ariaLabel={t('app.bookBar.zoomPreset', { value: preset })}
                  ariaPressed={zoom === preset}
                  onclick={() => onSetZoom?.(preset)}>{preset}%</Button
                >
              {/each}
            </div>
          </div>
        {/if}
        {#if flowing && onToggleFont}
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-[var(--muted-foreground)]">{t('app.font.bookLabel')}</span>
            <Button
              size="sm"
              variant="secondary"
              title={fontTitle}
              ariaLabel={fontTitle}
              testId="reader-font-toggle"
              onclick={onToggleFont}
            >
              <span
                class="text-[0.95rem] leading-none"
                style="font-family: {readerFont === 'serif'
                  ? "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
                  : "Georgia, 'Times New Roman', serif"}"
                aria-hidden="true">Аа</span
              >
              {readerFont === 'serif' ? t('app.font.toSans') : t('app.font.toSerif')}
            </Button>
          </div>
        {/if}
        {#if onToggleTheme}
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-[var(--muted-foreground)]">{t('app.theme.short')}</span>
            <Button
              size="sm"
              variant="secondary"
              title={themeTitle}
              ariaLabel={themeTitle}
              testId="reader-theme-toggle"
              onclick={() => onToggleTheme?.()}
            >
              <Icon name={readerTheme === 'dark' ? 'sun' : 'moon'} />
              {themeTitle}
            </Button>
          </div>
        {/if}
      </div>
    </Popover>
  {/if}

  {#if onOpenSearch}
    <Button
      size="icon"
      variant={searchOpen ? 'primary' : 'ghost'}
      title={hotkeyHint('reader.search', t('app.reader.searchShort'))}
      ariaLabel={t('app.reader.searchShort')}
      ariaPressed={searchOpen}
      testId="reader-search-toggle"
      onclick={onOpenSearch}
    >
      <Icon name="search" />
    </Button>
  {/if}

  <ActionMenu
    items={moreItems}
    onselect={runMore}
    ariaLabel={t('app.bookBar.more')}
    title={t('app.bookBar.more')}
    testId="book-bar-more"
    class="size-9"
  />
</div>
