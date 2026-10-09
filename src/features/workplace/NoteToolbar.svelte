<script lang="ts">
  import { Button, ColorPicker, Select, type ColorSwatch } from '@texture/ui';
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
  }

  let { tool, allowedTypes = NOTE_TYPES, onChange }: Props = $props();

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
</script>

<!--
  Панель выровнена влево единым рядом: сначала палитра цветов, затем типы
  заметок и сразу за ними вид фигуры. Всё идёт слева одной логической цепочкой
  (цвет → тип → вид фигуры), поэтому на широких экранах элементы не расходятся
  по краям и читаются как одна группа.
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
</div>
