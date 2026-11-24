<script lang="ts">
  import {
    Button,
    ColorPicker,
    Icon,
    Menu,
    MenuItem,
    SegmentedControl,
    type ColorSwatch,
    type SegmentedItem,
  } from '@context/ui';
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
   * Кнопка «висит» в левом верхнем углу области чтения: отступ сверху и слева
   * одинаковый. Кнопка на основной поверхности, а не на фоне страницы:
   * полупрозрачная подложка сливалась с книгой, и кнопку было не найти. По нажатию под кнопкой раскрывается выбор типа заметки, а сама
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

  /**
   * Оформление кнопки — по теме области чтения, а не интерфейса.
   *
   * Кнопка «висит» над книгой и относится к чтению: при тёмной книге в светлом
   * интерфейсе она обязана быть тёмной вместе с ней. Поэтому цвета берутся из
   * `--reader-accent`, который выводится из токенов области чтения.
   */
  const buttonClass =
    'bg-[var(--reader-accent)] text-[var(--reader-accent-ink)] hover:brightness-110';

  /** Типы заметок в общем порядке: только доступные формату. */
  const typeOptions = $derived(NOTE_TYPES.filter((type) => allowedTypes.includes(type)));

  /** Виды фигур в форме общего переключателя вариантов. */
  const shapeItems = $derived<SegmentedItem[]>(
    SHAPE_KINDS.map((shape) => ({ value: shape, label: shapeKindLabel(shape), icon: shape })),
  );

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
  function selectShape(shape: string) {
    onToolChange({ ...tool, shape: shape as ShapeKind });
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
  слева одинаковый — кнопка «висит» в левом верхнем углу.
  Кнопка на основной поверхности, а не на фоне меню: полупрозрачная подложка
  сливалась со страницей книги, и кнопку было не найти.
  Меню оформлено токенами области чтения: его поверхность, наведение, выбор и
  акцент подменяются на контейнере меню, поэтому вложенные `Menu`, `Menu`-пункты,
  переключатель фигуры и палитра цветов следуют за книгой, а не за интерфейсом.
-->
<div
  class="absolute left-2 top-2 z-[calc(var(--layer-panel)-1)] flex flex-col items-start gap-1"
  data-testid="note-tool"
>
  <Button
    variant="primary"
    size="icon"
    class={buttonClass}
    title={open ? t('app.modal.close') : t('app.bookBar.tool')}
    ariaLabel={open ? t('app.modal.close') : t('app.bookBar.tool')}
    ariaPressed={open}
    testId={open ? 'note-tool-close' : 'note-tool-toggle'}
    onclick={toggle}
  >
    <Icon name={open ? 'close' : 'pencil'} />
  </Button>

  {#if open}
    <div
      class="flex w-[13rem] flex-col gap-2 rounded-[var(--radius)] bg-[var(--reader-surface)] p-2 text-[var(--reader-foreground)] shadow-overlay [--control-surface:var(--reader-control-surface)] [--foreground:var(--reader-foreground)] [--muted-foreground:var(--reader-muted-foreground)] [--picker-surface:var(--reader-background)] [--primary:var(--reader-accent)] [--primary-foreground:var(--reader-accent-ink)] [--surface-hover:var(--reader-hover)] [--surface-selected:var(--reader-selected)]"
      data-testid="note-tool-menu"
      role="dialog"
      aria-label={t('app.bookBar.tool')}
    >
      <Menu ariaLabel={t('app.note.typeLabel')}>
        {#each typeOptions as type (type)}
          <MenuItem active={tool.type === type} onclick={() => selectType(type)}>
            <span class="flex min-w-0 items-center gap-2">
              <Icon name={type} class="size-4 shrink-0" />
              <span class="min-w-0 flex-1 truncate">{noteTypeLabel(type)}</span>
            </span>
          </MenuItem>
        {/each}
      </Menu>

      {#if tool.type === 'shape' && typeOptions.includes('shape')}
        <!-- Вид фигуры — общий переключатель вариантов: ряд иконок в один ряд,
             подпись видна подсказкой при наведении. -->
        <div data-testid="note-tool-shape">
          <SegmentedControl
            items={shapeItems}
            value={tool.shape}
            ariaLabel={t('app.note.shapeLabel')}
            onchange={selectShape}
          />
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
