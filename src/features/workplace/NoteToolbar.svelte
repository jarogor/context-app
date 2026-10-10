<script lang="ts">
  import {
    Button,
    ColorPicker,
    Icon,
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
</script>

<!--
  Верхняя панель чтения. Слева выстроена единая логическая цепочка инструментов
  заметок: палитра цветов, затем типы заметок и сразу за ними вид фигуры. Справа
  отдельной группой (`ml-auto`) прижато управление чтением: масштаб текста и
  кнопка-переключатель темы области чтения. Так инструменты заметок читаются как
  одна группа слева, а настройки вида — как отдельная группа справа.
-->
<div
  class="flex h-10 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-2"
  data-testid="note-toolbar"
>
  <ColorPicker
    colors={colorSwatches}
    onpick={(id) => selectColor(id as NoteColor)}
    ariaLabel="Цвет заметки"
    testIdPrefix="note-tool-color"
  />

  <div class="flex items-center gap-1" role="group" aria-label="Тип заметки">
    {#each typeOptions as type (type)}
      <Button
        variant={tool.type === type ? 'primary' : 'ghost'}
        size="md"
        title={NOTE_TYPE_LABELS[type]}
        ariaLabel={NOTE_TYPE_LABELS[type]}
        ariaPressed={tool.type === type}
        onclick={() => selectType(type)}
      >
        {NOTE_TYPE_LABELS[type]}
      </Button>
    {/each}
  </div>

  {#if tool.type === 'shape' && typeOptions.includes('shape')}
    <div class="flex items-center" data-testid="note-tool-shape">
      <Select
        value={tool.shape}
        items={shapeOptions}
        size="md"
        class="w-[150px]"
        ariaLabel="Вид фигуры"
        onchange={selectShape}
      />
    </div>
  {/if}

  <div class="ml-auto flex items-center gap-1" data-testid="note-toolbar-reading">
    {#if showZoom}
      <Button
        size="icon"
        variant="ghost"
        title="Уменьшить масштаб"
        ariaLabel="Уменьшить масштаб"
        disabled={zoom <= minZoom}
        onclick={() => onChangeZoom?.(-10)}>−</Button
      >
      <span class="min-w-[48px] text-center" data-testid="reader-zoom">{zoom}%</span>
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
