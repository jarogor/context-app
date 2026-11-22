<script lang="ts">
  import { ColorPicker, Icon, type ColorSwatch } from '@context/ui';
  import { t } from '@context/i18n';
  import { pushDismissLayer } from '../hotkeys/dismiss-layer';
  import {
    DEFAULT_NOTE_TYPE,
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
  } from './notes';

  /** Меню инструмента заметок в области чтения страничной книги.
   *
   * Кнопка «висит» в правом верхнем углу области чтения: отступ сверху и справа
   * одинаковый. По нажатию под кнопкой раскрывается выбор типа заметки, а сама
   * кнопка становится кнопкой закрытия на том же месте. Меню закрывает только
   * пользователь — кнопкой или Escape; выбор типа и создание заметки его не
   * закрывают. Закрытое меню возвращает инструмент к цитате.
   *
   * У текучей книги типы недоступны, и вместо меню показывается переключатель
   * гарнитуры (см. `WorkplaceArea`).
   */

  interface Props {
    /** Активный инструмент заметок. */
    tool: NoteTool;
    /** Доступные формату типы заметок. */
    allowedTypes: readonly NoteType[];
    /** Смена инструмента заметок. */
    onToolChange: (tool: NoteTool) => void;
  }

  let { tool, allowedTypes, onToolChange }: Props = $props();

  /** Открыто ли меню выбора типа. */
  let open = $state(false);

  /** Типы заметок в общем порядке: только доступные формату. */
  const typeOptions = $derived(NOTE_TYPES.filter((type) => allowedTypes.includes(type)));

  /** Образцы цвета заметки. */
  const colorSwatches = $derived<ColorSwatch[]>(
    NOTE_COLORS.map((color) => ({
      id: color,
      label: noteColorLabel(color),
      value: NOTE_COLOR_SWATCHES[color],
      selected: tool.color === color,
    })),
  );

  /** Выбор типа заметки: меню остаётся открытым. */
  function selectType(type: NoteType) {
    onToolChange({ ...tool, type });
  }

  /** Выбор вида фигуры: меню остаётся открытым. */
  function selectShape(shape: ShapeKind) {
    onToolChange({ ...tool, shape });
  }

  /** Выбор цвета заметки. */
  function selectColor(color: NoteColor) {
    onToolChange({ ...tool, color });
  }

  /** Закрытие меню с возвратом инструмента к цитате. */
  function close() {
    open = false;
    if (tool.type !== DEFAULT_NOTE_TYPE) {
      onToolChange({ ...tool, type: DEFAULT_NOTE_TYPE });
    }
  }

  /** Открытие и закрытие меню одной кнопкой на одном месте. */
  function toggle() {
    if (open) {
      close();
      return;
    }
    open = true;
  }

  /** Пока меню открыто, оно закрывается общим действием Escape. */
  $effect(() => {
    if (!open) {
      return;
    }
    return pushDismissLayer(close);
  });
</script>

<!--
  Кнопка инструмента и его меню стоят в области чтения, а не на панели вкладки:
  выбор типа относится к странице книги, и оттуда до неё ближе. Отступ сверху и
  справа одинаковый — кнопка «висит» в правом верхнем углу.
-->
<div
  class="absolute right-2 top-2 z-[calc(var(--layer-panel)-1)] flex flex-col items-end gap-1"
  data-testid="note-tool"
>
  <button
    type="button"
    class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] bg-[var(--menu-surface)] text-[var(--foreground)] shadow-overlay transition-colors hover:bg-[var(--surface-hover)]"
    title={open ? t('app.modal.close') : t('app.bookBar.tool')}
    aria-label={open ? t('app.modal.close') : t('app.bookBar.tool')}
    aria-expanded={open}
    aria-pressed={!open && tool.type !== DEFAULT_NOTE_TYPE}
    data-testid={open ? 'note-tool-close' : 'note-tool-toggle'}
    onclick={toggle}
  >
    <Icon name={open ? 'close' : 'pencil'} />
  </button>

  {#if open}
    <div
      class="flex w-[13rem] flex-col gap-2 rounded-[var(--radius)] bg-[var(--menu-surface)] p-2 text-[var(--foreground)] shadow-overlay"
      data-testid="note-tool-menu"
      role="dialog"
      aria-label={t('app.bookBar.tool')}
    >
      <div class="flex flex-col gap-0.5">
        {#each typeOptions as type (type)}
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 rounded-[calc(var(--radius)*0.75)] px-2 py-1.5 text-left text-sm transition-colors {tool.type ===
            type
              ? 'bg-[var(--primary)] font-semibold text-[var(--primary-foreground)]'
              : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'}"
            aria-pressed={tool.type === type}
            onclick={() => selectType(type)}
          >
            <Icon name={type} class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{noteTypeLabel(type)}</span>
            {#if tool.type === type}
              <Icon name="check" class="size-4 shrink-0" />
            {/if}
          </button>
        {/each}
      </div>

      {#if tool.type === 'shape' && typeOptions.includes('shape')}
        <!--
          Вид фигуры — ряд иконок без подписей, заголовка и разделителей: иконка
          уже показывает фигуру, а подпись появляется подсказкой при наведении.
        -->
        <div class="flex items-center gap-1" data-testid="note-tool-shape">
          {#each SHAPE_KINDS as shape (shape)}
            <button
              type="button"
              class="flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[calc(var(--radius)*0.75)] transition-colors {tool.shape ===
              shape
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'}"
              title={shapeKindLabel(shape)}
              aria-label={shapeKindLabel(shape)}
              aria-pressed={tool.shape === shape}
              onclick={() => selectShape(shape)}
            >
              <Icon name={shape} class="size-4 shrink-0" />
            </button>
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
  {/if}
</div>
