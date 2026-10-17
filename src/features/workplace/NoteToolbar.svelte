<script lang="ts">
  import {
    Button,
    ColorPicker,
    Icon,
    Input,
    Progress,
    Select,
    DEFAULT_READER_THEME,
    type ColorSwatch,
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
    /** Изменение масштаба на заданную величину. */
    onChangeZoom?: (delta: number) => void;
    /** Переключение темы области чтения на противоположную. */
    onChangeReaderTheme?: (theme: ReaderThemeId) => void;
    /** Показывать ли инструменты создания заметок (режим заметок). */
    notesMode?: boolean;
    /** Читается ли книга плагином рабочего места. */
    workplace?: boolean;
    /** Поддерживает ли плагин страницы. */
    workplacePages?: boolean;
    /** Текущая страница плагина или `null`. */
    workplacePage?: number | null;
    /** Общее число страниц плагина или `null`. */
    workplacePageCount?: number | null;
    /** Прогресс чтения в процентах. */
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
    onChangeZoom,
    onChangeReaderTheme,
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

  /** Подпись кнопки-переключателя: называет тему, на которую кнопка переключает. */
  const themeLabel = $derived(
    readerTheme === 'dark' ? 'Светлая тема области чтения' : 'Тёмная тема области чтения',
  );

  /** Подсказка кнопки-переключателя: описывает действие переключения. */
  const themeTitle = $derived(
    readerTheme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему',
  );

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
  Единая панель чтения. Слева — инструменты заметок (по требованию, в режиме
  заметок): типы, вид фигуры и палитра цветов. Справа — управление чтением:
  навигация по страницам, прогресс, масштаб и переключатель темы области
  чтения. Так вкладки, управление и инструменты читаются одной панелью, а не
  несколькими полосами подряд.
-->
<div
  class="flex h-10 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-2"
  data-testid="note-toolbar"
>
  {#if notesMode && typeOptions.length > 1}
    <div class="flex items-center gap-1" role="group" aria-label="Тип заметки">
      {#each typeOptions as type (type)}
        <Button
          variant={tool.type === type ? 'primary' : 'ghost'}
          size="sm"
          title={NOTE_TYPE_LABELS[type]}
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
        size="sm"
        class="w-[9.375rem]"
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

  <div class="ml-auto flex items-center gap-2" data-testid="reader-footer">
    <div class="flex items-center gap-1 md:gap-2" data-testid="note-toolbar-reading">
      {#if workplace && workplacePages && workplacePage !== null}
        <div class="flex shrink-0 items-center gap-1 whitespace-nowrap" data-testid="reader-pages">
          <Button
            size="icon"
            variant="ghost"
            title="Предыдущая страница"
            ariaLabel="Предыдущая страница"
            disabled={workplacePage <= 1}
            onclick={() => onStepPage?.(-1)}
          >
            <Icon name="chevron-left" />
          </Button>
          <Input
            class="h-6 w-[3.5rem] shrink-0 px-1 py-0 text-center"
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
          <span class="whitespace-nowrap" data-testid="reader-page-count"
            >/ {workplacePageCount ?? '?'}</span
          >
          <Button
            size="icon"
            variant="ghost"
            title="Следующая страница"
            ariaLabel="Следующая страница"
            disabled={workplacePageCount !== null && workplacePage >= workplacePageCount}
            onclick={() => onStepPage?.(1)}
          >
            <Icon name="chevron-right" />
          </Button>
        </div>
      {/if}
      <span class="whitespace-nowrap role-caption text-[var(--muted-foreground)]" data-testid="reader-progress"
        >{Math.round(progress)}%</span
      >
      <Progress value={progress} class="w-[7rem] max-md:hidden" />
      {#if showZoom}
        <Button
          size="icon"
          variant="ghost"
          title="Уменьшить масштаб"
          ariaLabel="Уменьшить масштаб"
          disabled={zoom <= minZoom}
          onclick={() => onChangeZoom?.(-10)}>−</Button
        >
        <span class="min-w-[3rem] text-center role-caption" data-testid="reader-zoom">{zoom}%</span>
        <Button
          size="icon"
          variant="ghost"
          title="Увеличить масштаб"
          ariaLabel="Увеличить масштаб"
          disabled={zoom >= maxZoom}
          onclick={() => onChangeZoom?.(10)}>+</Button
        >
      {/if}
      <div class="flex items-center gap-1" data-testid="reader-theme-toggle">
        <Button
          size="icon"
          variant="ghost"
          title={themeTitle}
          ariaLabel={themeLabel}
          onclick={toggleReaderTheme}
        >
          <Icon name={readerTheme === 'dark' ? 'sun' : 'moon'} />
        </Button>
      </div>
    </div>
  </div>
</div>
