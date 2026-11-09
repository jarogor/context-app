<script lang="ts">
  import {
    Button,
    ColorPicker,
    Icon,
    Input,
    Select,
    DEFAULT_READER_FONT,
    DEFAULT_READER_THEME,
    type ColorSwatch,
    type ReaderFontId,
    type ReaderThemeId,
  } from '@context/ui';
  import { t } from '@context/i18n';
  import { NARROW_MAX_WIDTH } from '../../shared/breakpoints';
  import { hotkeyHint } from '../hotkeys/registry';
  import {
    NOTE_COLORS,
    noteColorLabel,
    NOTE_COLOR_SWATCHES,
    NOTE_TYPES,
    noteTypeLabel,
    SHAPE_KINDS,
    shapeKindLabel,
    type NoteColor,
    type NoteTool,
    type NoteType,
    type ShapeKind,
  } from '../notes/notes';

  interface Props {
    /** Активный инструмент создания заметок. */
    tool: NoteTool;
    /** Доступные типы заметок текущего формата; по умолчанию все три. */
    allowedTypes?: readonly NoteType[];
    /** Сообщение о выборе инструмента или цвета. */
    onChange: (tool: NoteTool) => void;
    /** Текущий масштаб текста в процентах. */
    zoom?: number;
    /** Нижняя граница масштаба. */
    minZoom?: number;
    /** Верхняя граница масштаба. */
    maxZoom?: number;
    /** Поддерживает ли текущий формат изменение масштаба. */
    showZoom?: boolean;
    /** Текущая тема области чтения. */
    readerTheme?: ReaderThemeId;
    /** Текущая гарнитура книги. */
    readerFont?: ReaderFontId;
    /** Переключение гарнитуры книги на противоположную. */
    onChangeReaderFont?: (font: ReaderFontId) => void;
    /** Изменение масштаба на один шаг шкалы: `1` — увеличение, `-1` — уменьшение. */
    onChangeZoom?: (direction: 1 | -1) => void;
    /** Переключение темы области чтения на противоположную. */
    onChangeReaderTheme?: (theme: ReaderThemeId) => void;
    /** Показывать ли инструменты создания заметок (книга открыта). */
    notesMode?: boolean;
    /** Книга текучего формата (EPUB, FB2): текст течёт и масштабируется. */
    flowing?: boolean;
    /** Читается ли книга плагином рабочего места. */
    workplace?: boolean;
    /** Поддерживает ли плагин страницы. */
    workplacePages?: boolean;
    /** Текущая страница плагина или `null`. */
    workplacePage?: number | null;
    /** Общее число страниц плагина или `null`. */
    workplacePageCount?: number | null;
    /** Прогресс чтения в процентах (у постраничных форматов не показывается). */
    progress?: number;
    /** Переход к соседней странице. */
    onStepPage?: (delta: number) => void;
    /** Переход к введённому номеру страницы. */
    onGoToPage?: (page: number) => void;
    /** Переключение панели поиска по книге. */
    onToggleSearch?: () => void;
    /** Открыта ли панель поиска по книге. */
    searchOpen?: boolean;
  }

  let {
    tool,
    allowedTypes = NOTE_TYPES,
    onChange,
    zoom = 100,
    minZoom = 60,
    maxZoom = 220,
    showZoom = true,
    readerTheme = DEFAULT_READER_THEME,
    readerFont = DEFAULT_READER_FONT,
    onChangeZoom,
    onChangeReaderTheme,
    onChangeReaderFont,
    notesMode = false,
    flowing = false,
    workplace = false,
    workplacePages = false,
    workplacePage = null,
    workplacePageCount = null,
    progress = 0,
    onStepPage,
    onGoToPage,
    onToggleSearch,
    searchOpen = false,
  }: Props = $props();

  /** Варианты видов фигур для выпадающего списка. */
  const shapeOptions = $derived(
    SHAPE_KINDS.map((kind) => ({ value: kind, label: shapeKindLabel(kind) })),
  );

  /** Доступные инструменты типов в порядке панели. */
  const typeOptions = $derived(NOTE_TYPES.filter((type) => allowedTypes.includes(type)));

  /** Образцы выбора цвета заметки. */
  const colorSwatches = $derived<ColorSwatch[]>(
    NOTE_COLORS.map((color) => ({
      id: color,
      label: noteColorLabel(color),
      value: NOTE_COLOR_SWATCHES[color],
      selected: tool.color === color,
    })),
  );

  /** Подсказки кнопок типов заметок: коротко называют сам тип. */
  const NOTE_TYPE_TITLES: Record<NoteType, string> = $derived({
    quote: noteTypeLabel('quote'),
    text: noteTypeLabel('text'),
    shape: noteTypeLabel('shape'),
  });

  /** Подпись кнопки-переключателя: называет тему, на которую кнопка переключает. */
  const themeLabel = $derived(
    readerTheme === 'dark' ? t('app.theme.reader.light') : t('app.theme.reader.dark'),
  );

  /** Подсказка кнопки-переключателя: описывает действие переключения. */
  const themeTitle = $derived(
    readerTheme === 'dark' ? t('app.theme.reader.toLight') : t('app.theme.reader.toDark'),
  );

  /** Подпись кнопки-переключателя гарнитуры: называет шрифт, на который она переключает. */
  const fontLabel = $derived(
    readerFont === 'serif' ? t('app.font.toSans') : t('app.font.toSerif'),
  );

  /** Подсказка кнопки-переключателя гарнитуры. */
  const fontTitle = $derived(
    readerFont === 'serif' ? t('app.font.switchToSans') : t('app.font.switchToSerif'),
  );

  /** Переключение гарнитуры книги на противоположную. */
  function toggleReaderFont() {
    onChangeReaderFont?.(readerFont === 'serif' ? 'sans' : 'serif');
  }

  /** Узкое окно: панель внизу, инструменты компактные.
   *
   * Ширина палитры цвета задаётся числом, поэтому компактный размер выбирается
   * не классом, а этим признаком: на узком окне цвет должен стоять сразу за
   * списком вида фигуры в той же строке.
   */
  let compact = $state(false);

  /** Слежение за шириной окна для компактной панели. */
  $effect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia(NARROW_MAX_WIDTH);
    compact = query.matches;
    const onChange = (event: MediaQueryListEvent) => {
      compact = event.matches;
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  /** Черновик правки поля текущей страницы; `null` — поле показывает снимок. */
  let pageDraft = $state<string | null>(null);

  /**
   * Видимое значение поля страницы.
   *
   * Пока пользователь не правит поле, значение берётся из снимка текущей
   * страницы и следует за листанием; во время правки показывается черновик.
   */
  const pageValue = $derived(pageDraft ?? (workplacePage === null ? '' : String(workplacePage)));

  /** Выбор типа заметки. */
  function selectType(type: NoteType) {
    if (type !== tool.type) {
      onChange({ ...tool, type });
    }
  }

  /** Выбор вида фигуры. */
  function selectShape(value: string) {
    onChange({ ...tool, shape: value as ShapeKind });
  }

  /** Выбор цвета заметки. */
  function selectColor(color: NoteColor) {
    if (color !== tool.color) {
      onChange({ ...tool, color });
    }
  }

  /** Переключение темы области чтения на противоположную. */
  function toggleReaderTheme() {
    onChangeReaderTheme?.(readerTheme === 'dark' ? 'light' : 'dark');
  }

  /** Переход к введённому номеру страницы. */
  function commitPage() {
    const draft = pageDraft?.trim();
    if (draft !== undefined && draft !== '') {
      const page = Number(draft);
      if (Number.isInteger(page) && page >= 1) {
        onGoToPage?.(page);
      }
    }
    pageDraft = null;
  }
</script>

<!--
  Единая панель чтения. Слева — инструменты заметок: типы, вид фигуры и шрифт
  книги (показываются всегда, пока открыта книга, чтобы создание заметок было
  доступно и без открытой панели заметок). Справа — управление чтением: навигация
  по страницам, прогресс, масштаб и переключатель темы. Числовые элементы не
  меняют ширину при смене числа цифр (табличные цифры и фиксированные слоты),
  поэтому панель не «прыгает».

  На узком окне панель переезжает вниз области чтения и раскладывается на две
  строки по разрыву: сверху — инструменты заметок (типы, шрифт, вид фигуры и цвет
  справа), снизу — управление чтением: тема, масштаб и навигация. Обе строки идут
  слева направо, чтобы глаз читал панель как один список, а не перескакивал с края
  на край. На узком окне кнопки типов показываются иконками (подписи там не
  влезают), а подсказка у кнопки называет тип: «Цитата», «Текст», «Фигура».
-->
<div
  class="flex flex-wrap items-center gap-1.5 border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm [font-variant-numeric:tabular-nums] max-large-tablet:order-last max-large-tablet:gap-1 max-large-tablet:border-t large-tablet:h-11 large-tablet:border-b large-tablet:border-t-0 large-tablet:px-3 large-tablet:py-0"
  data-testid="note-toolbar"
>
  {#if notesMode && typeOptions.length > 1}
    <div
      class="flex items-center gap-0.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5 max-large-tablet:order-1"
      role="group"
      aria-label={t('app.note.typeLabel')}
    >
      {#each typeOptions as type (type)}
        <Button
          variant={tool.type === type ? 'primary' : 'ghost'}
          size="sm"
          title={NOTE_TYPE_TITLES[type]}
          ariaLabel={noteTypeLabel(type)}
          ariaPressed={tool.type === type}
          class="max-large-tablet:px-2"
          onclick={() => selectType(type)}
        >
          <Icon name={type} class="hidden max-large-tablet:block" />
          <span class="max-large-tablet:hidden">{noteTypeLabel(type)}</span>
        </Button>
      {/each}
    </div>
  {/if}

  <!--
    Гарнитура книги живёт рядом с типами заметок и только у текучих форматов
    (EPUB, FB2): у постраничных форматов шрифт задаёт сам файл, и кнопка там
    ничего не меняла бы. Как и у типов заметок, у масштаба и у навигации,
    кнопка стоит в собственном блоке с фоном — единый вид управляющих групп
    панели; блок готов принять и другие действия оформления текста. Знак —
    «Аа» той гарнитуры, на которую кнопка переключает, поэтому действие видно
    без чтения подсказки.
  -->
  {#if flowing && onChangeReaderFont}
    <div
      class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5 max-large-tablet:order-2"
      role="group"
      aria-label={t('app.font.bookLabel')}
      data-testid="reader-font-toggle"
    >
      <Button
        size="icon"
        variant="ghost"
        title={fontTitle}
        ariaLabel={fontLabel}
        class="size-8"
        onclick={toggleReaderFont}
      >
        <span
          class="text-[0.95rem] leading-none"
          style="font-family: {readerFont === 'serif'
            ? "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
            : "Georgia, 'Times New Roman', serif"}"
          aria-hidden="true">Аа</span
        >
      </Button>
    </div>
  {/if}

  {#if notesMode && tool.type === 'shape' && typeOptions.includes('shape')}
    <div class="flex items-center max-large-tablet:order-3" data-testid="note-tool-shape">
      <Select
        value={tool.shape}
        items={shapeOptions}
        class="h-8 w-[6.25rem] text-sm max-large-tablet:w-[5.75rem]"
        ariaLabel={t('app.note.shapeLabel')}
        onchange={selectShape}
      />
    </div>
  {/if}

  {#if notesMode && tool.type === 'shape' && typeOptions.includes('shape')}
    <ColorPicker
      colors={colorSwatches}
      onpick={(id) => selectColor(id as NoteColor)}
      ariaLabel={t('app.note.colorMenuLabel')}
      testIdPrefix="note-tool-color"
      size={compact ? 'sm' : 'md'}
      class="h-8 max-large-tablet:order-4"
    />
  {/if}

  <!-- Разрыв строки на узком окне: выше — инструменты, ниже — управление чтением. -->
  <span class="hidden max-large-tablet:order-5 max-large-tablet:block max-large-tablet:basis-full" aria-hidden="true"></span>

  <!--
    Управление чтением: на широком окне — группа справа от инструментов заметок
    (`ml-auto`), на узком — её блоки встают в общий перенос панели
    (`max-large-tablet:contents`) и получают место в нижней строке порядком `order`:
    переключатель темы, масштаб, навигация по страницам, прогресс.
  -->
  <div class="flex items-center gap-1.5 max-large-tablet:contents large-tablet:ml-auto" data-testid="reader-footer">
    <!--
      Постраничная навигация: кнопки стоят **в ряд** и идут слева направо —
      «Следующая страница» (вниз), «Предыдущая страница» (вверх), затем поле номера
      и число страниц. Прогресса чтения у постраничных форматов нет: он дублировал
      бы место в книге.
    -->
    {#if workplace && workplacePages && workplacePage !== null}
      <div
        class="flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5 max-large-tablet:order-8 max-large-tablet:gap-1"
        data-testid="reader-pages"
      >
        <button
          type="button"
          title={t('app.reader.nextPage')}
          aria-label={t('app.reader.nextPage')}
          disabled={workplacePageCount !== null && workplacePage >= workplacePageCount}
          class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40 max-large-tablet:h-7 max-large-tablet:w-7"
          onclick={() => onStepPage?.(1)}
        >
          <Icon name="chevron-down" class="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('app.reader.prevPage')}
          aria-label={t('app.reader.prevPage')}
          disabled={workplacePage <= 1}
          class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40 max-large-tablet:h-7 max-large-tablet:w-7"
          onclick={() => onStepPage?.(-1)}
        >
          <Icon name="chevron-up" class="h-4 w-4" />
        </button>
        <!--
          Поле номера и число страниц — фиксированной ширины по максимуму
          разрядности счётчика: смена «9 → 10» не сдвигает ни кнопки, ни соседние
          блоки, поэтому вся полоса стоит на месте.
        -->
        <Input
          class="h-8 w-[3.5rem] shrink-0 border-0 bg-card px-1 py-0 text-right text-sm max-large-tablet:w-[2.75rem] max-large-tablet:px-1 max-large-tablet:text-xs"
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
          class="inline-block min-w-[3rem] shrink-0 pr-2 whitespace-nowrap text-left text-sm max-large-tablet:min-w-[1.75rem] max-large-tablet:pr-1 max-large-tablet:text-xs"
          data-testid="reader-page-count"
          >/ {workplacePageCount ?? '?'}</span
        >
      </div>
    {/if}
    <!--
      Прогресс чтения остаётся только у текучих (текстовых) книг: у постраничных он
      дублировал бы место в книге и загромождал полосу. Цифра фиксированной ширины,
      поэтому не «прыгает».
    -->
    {#if !(workplace && workplacePages)}
      <span
        class="inline-block w-[2.75rem] shrink-0 text-right whitespace-nowrap text-sm text-[var(--muted-foreground)] max-large-tablet:order-9 max-large-tablet:text-xs"
        data-testid="reader-progress"
        >{Math.round(progress)}%</span
      >
    {/if}
    <!--
      Масштаб: кнопки «меньше/больше» стоят рядом друг с другом **слева** от
      цифры, а сама цифра — фиксированной ширины, поэтому кнопки и переключатель
      темы не «прыгают» при смене числа разрядов.
    -->
    {#if showZoom}
      <div
        class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5 max-large-tablet:order-7 max-large-tablet:gap-0"
        data-testid="reader-zoom-group"
      >
        <Button
          size="icon"
          variant="ghost"
          title={hotkeyHint('reader.zoom.out', t('app.reader.zoomOut'))}
          ariaLabel={t('app.reader.zoomOut')}
          class="size-8"
          disabled={zoom <= minZoom}
          onclick={() => onChangeZoom?.(-1)}>−</Button
        >
        <Button
          size="icon"
          variant="ghost"
          title={hotkeyHint('reader.zoom.in', t('app.reader.zoomIn'))}
          ariaLabel={t('app.reader.zoomIn')}
          class="size-8"
          disabled={zoom >= maxZoom}
          onclick={() => onChangeZoom?.(1)}>+</Button
        >
        <span
          class="inline-block w-[3.25rem] text-center text-sm max-large-tablet:w-[3.25rem] max-large-tablet:text-xs"
          data-testid="reader-zoom">{zoom}%</span
        >
      </div>
    {/if}
    <!--
      Поиск по книге стоит справа от масштаба: это действие над текстом книги,
      поэтому оно рядом с управлением чтением, а не в левой группе инструментов
      заметок. Панель поиска открывается поверх области содержимого.
    -->
    {#if onToggleSearch}
      <div class="flex shrink-0 items-center gap-1 max-large-tablet:order-10" data-testid="reader-search-toggle">
        <Button
          size="icon"
          variant={searchOpen ? 'primary' : 'ghost'}
          title={hotkeyHint('reader.search', t('app.reader.searchShort'))}
          ariaLabel={t('app.reader.searchShort')}
          ariaPressed={searchOpen}
          class="size-8"
          onclick={() => onToggleSearch?.()}
        >
          <Icon name="search" />
        </Button>
      </div>
    {/if}
    <div
      class="flex shrink-0 items-center gap-1 max-large-tablet:order-6"
      data-testid="reader-theme-toggle"
    >
      <Button
        size="icon"
        variant="ghost"
        title={themeTitle}
        ariaLabel={themeLabel}
        class="size-8"
        onclick={toggleReaderTheme}
      >
        <Icon name={readerTheme === 'dark' ? 'sun' : 'moon'} />
      </Button>
    </div>
  </div>
</div>
