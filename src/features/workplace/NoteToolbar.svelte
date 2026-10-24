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
  } from '@texture/ui';
  import {
    NOTE_COLORS,
    NOTE_COLOR_LABELS,
    NOTE_COLOR_SWATCHES,
    NOTE_TYPE_LABELS,
    NOTE_TYPES,
    SHAPE_KINDS,
    SHAPE_KIND_LABELS,
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
    workplace = false,
    workplacePages = false,
    workplacePage = null,
    workplacePageCount = null,
    progress = 0,
    onStepPage,
    onGoToPage,
  }: Props = $props();

  /** Варианты видов фигур для выпадающего списка. */
  const shapeOptions = $derived(
    SHAPE_KINDS.map((kind) => ({ value: kind, label: SHAPE_KIND_LABELS[kind] })),
  );

  /** Доступные инструменты типов в порядке панели. */
  const typeOptions = $derived(NOTE_TYPES.filter((type) => allowedTypes.includes(type)));

  /** Образцы выбора цвета заметки. */
  const colorSwatches = $derived<ColorSwatch[]>(
    NOTE_COLORS.map((color) => ({
      id: color,
      label: NOTE_COLOR_LABELS[color],
      value: NOTE_COLOR_SWATCHES[color],
      selected: tool.color === color,
    })),
  );

  /** Подсказки кнопок типов заметок: объясняют назначение, а не повторяют подпись. */
  const NOTE_TYPE_TITLES: Record<NoteType, string> = {
    quote: 'Выделить текст на странице и сохранить цитату',
    text: 'Поставить текстовую карточку в любом месте страницы',
    shape: 'Обвести область на странице фигурой',
  };

  /** Подпись кнопки-переключателя: называет тему, на которую кнопка переключает. */
  const themeLabel = $derived(
    readerTheme === 'dark' ? 'Светлая тема области чтения' : 'Тёмная тема области чтения',
  );

  /** Подсказка кнопки-переключателя: описывает действие переключения. */
  const themeTitle = $derived(
    readerTheme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему',
  );

  /** Подпись кнопки-переключателя гарнитуры: называет шрифт, на который она переключает. */
  const fontLabel = $derived(
    readerFont === 'serif' ? 'Шрифт без засечек' : 'Шрифт с засечками',
  );

  /** Подсказка кнопки-переключателя гарнитуры. */
  const fontTitle = $derived(
    readerFont === 'serif' ? 'Переключить на шрифт без засечек' : 'Переключить на шрифт с засечками',
  );

  /** Переключение гарнитуры книги на противоположную. */
  function toggleReaderFont() {
    onChangeReaderFont?.(readerFont === 'serif' ? 'sans' : 'serif');
  }

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
  Единая панель чтения. Слева — инструменты заметок: типы, вид фигуры и палитра
  цветов (показываются всегда, пока открыта книга, чтобы создание заметок было
  доступно и без открытой панели заметок). Справа — управление чтением: навигация
  по страницам, прогресс, масштаб и переключатель темы. Числовые элементы не
  меняют ширину при смене числа цифр (табличные цифры и фиксированные слоты),
  поэтому панель не «прыгает».
-->
<div
  class="flex h-11 flex-wrap items-center gap-1.5 border-b border-[var(--border)] bg-[var(--card)] px-3 text-sm [font-variant-numeric:tabular-nums]"
  data-testid="note-toolbar"
>
  {#if notesMode && typeOptions.length > 1}
    <div
      class="flex items-center gap-0.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5"
      role="group"
      aria-label="Тип заметки"
    >
      {#each typeOptions as type (type)}
        <Button
          variant={tool.type === type ? 'primary' : 'ghost'}
          size="sm"
          title={NOTE_TYPE_TITLES[type]}
          ariaLabel={NOTE_TYPE_LABELS[type]}
          ariaPressed={tool.type === type}
          onclick={() => selectType(type)}
        >
          {NOTE_TYPE_LABELS[type]}
        </Button>
      {/each}
    </div>
  {/if}

  {#if notesMode && tool.type === 'shape' && typeOptions.includes('shape')}
    <div class="flex items-center" data-testid="note-tool-shape">
      <Select
        value={tool.shape}
        items={shapeOptions}
        class="h-8 w-[9.375rem] text-sm"
        ariaLabel="Вид фигуры"
        onchange={selectShape}
      />
    </div>
  {/if}

  {#if notesMode && tool.type === 'shape' && typeOptions.includes('shape')}
    <ColorPicker
      colors={colorSwatches}
      onpick={(id) => selectColor(id as NoteColor)}
      ariaLabel="Цвет заметки"
      testIdPrefix="note-tool-color"
      class="h-8"
    />
  {/if}

  <div class="ml-auto flex items-center gap-1.5" data-testid="reader-footer">
  <!--
    Постраничная навигация: кнопки стоят **в ряд** и идут слева направо —
    «Следующая страница» (вниз), «Предыдущая страница» (вверх), затем поле номера
    и число страниц. Прогресса чтения у постраничных форматов нет: он дублировал
    бы место в книге.
  -->
  {#if workplace && workplacePages && workplacePage !== null}
    <div
      class="flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5"
      data-testid="reader-pages"
    >
      <button
        type="button"
        title="Следующая страница"
        aria-label="Следующая страница"
        disabled={workplacePageCount !== null && workplacePage >= workplacePageCount}
        class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
        onclick={() => onStepPage?.(1)}
      >
        <Icon name="chevron-down" class="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Предыдущая страница"
        aria-label="Предыдущая страница"
        disabled={workplacePage <= 1}
        class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
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
        class="h-8 w-[3.5rem] shrink-0 border-0 bg-card px-1 py-0 text-right text-sm"
        ariaLabel="Текущая страница"
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
        class="inline-block min-w-[3rem] shrink-0 pr-2 whitespace-nowrap text-left text-sm"
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
      class="inline-block w-[2.75rem] shrink-0 text-right whitespace-nowrap text-sm text-[var(--muted-foreground)]"
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
      class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--panel)] p-0.5"
      data-testid="reader-zoom-group"
    >
      <Button
        size="icon"
        variant="ghost"
        title="Уменьшить масштаб"
        ariaLabel="Уменьшить масштаб"
        class="size-8"
        disabled={zoom <= minZoom}
        onclick={() => onChangeZoom?.(-1)}>−</Button
      >
      <Button
        size="icon"
        variant="ghost"
        title="Увеличить масштаб"
        ariaLabel="Увеличить масштаб"
        class="size-8"
        disabled={zoom >= maxZoom}
        onclick={() => onChangeZoom?.(1)}>+</Button
      >
      <span
        class="inline-block w-[3.25rem] text-center text-sm"
        data-testid="reader-zoom">{zoom}%</span
      >
    </div>
  {/if}
  {#if onChangeReaderFont}
    <!--
      Гарнитура книги: одна кнопка переключает шрифт с засечками и без.
      Знак — «Аа» той гарнитуры, на которую кнопка переключает, поэтому
      действие видно без чтения подсказки.
    -->
    <div class="flex shrink-0 items-center gap-1" data-testid="reader-font-toggle">
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
  <div class="flex shrink-0 items-center gap-1" data-testid="reader-theme-toggle">
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
