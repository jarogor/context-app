<script lang="ts" module>
  /** Образец цвета в единой палитре выбора. */
  export interface ColorSwatch {
    /** Идентификатор цвета, передаваемый в обработчик выбора. */
    id: string;
    /** Подпись цвета для доступности и подсказки. */
    label: string;
    /** CSS-значение цвета образца. */
    value: string;
    /** Выбран ли цвет в данный момент. */
    selected?: boolean;
  }
</script>

<script lang="ts">
  import { cn } from '../utils';

  interface Props {
    /** Образцы палитры. */
    colors: ColorSwatch[];
    /** Обработчик выбора цвета. */
    onpick: (id: string) => void;
    /** Метка доступности группы цветов. */
    ariaLabel?: string;
    /** Префикс идентификаторов для проверок. */
    testIdPrefix?: string;
    /** Размер: базовый — как у кнопок и полей, компактный — для тесных панелей. */
    size?: 'md' | 'sm';
    /** Дополнительные классы контейнера. */
    class?: string;
  }

  let {
    colors,
    onpick,
    ariaLabel = 'Цвет',
    testIdPrefix = 'color',
    size = 'md',
    class: className = '',
  }: Props = $props();

  /** Базовая ширина невыбранного образца в пикселях.
   *
   * Образцы делят ширину блока по весам `flex-grow`: выбранный забирает долю
   * `SELECTED_GROW`, прочие — по единице. Отсюда базовая ширина блока. */
  const SWATCH_WIDTH = 16;
  /** Зазор между образцами в пикселях. */
  const SWATCH_GAP = 3;
  /** Во сколько раз выбранный образец шире невыбранного. */
  const SELECTED_GROW = 1.8;
  /** Рамка и внутренние отступы блока по обеим сторонам в пикселях. */
  const PICKER_CHROME = 12;

  /** Компактные значения тех же величин: палитра для тесных панелей. */
  const COMPACT_SWATCH_WIDTH = 12;
  const COMPACT_SWATCH_GAP = 2;
  const COMPACT_PICKER_CHROME = 8;

  /** Ширина блока палитры: при наведении плашки перераспределяются внутри неё,
   * а сам блок не меняет размер и не сдвигает соседний интерфейс. */
  const pickerWidth = $derived(
    Math.round(
      (size === 'sm' ? COMPACT_SWATCH_WIDTH : SWATCH_WIDTH) * (colors.length - 1 + SELECTED_GROW) +
        Math.max(0, colors.length - 1) * (size === 'sm' ? COMPACT_SWATCH_GAP : SWATCH_GAP) +
        (size === 'sm' ? COMPACT_PICKER_CHROME : PICKER_CHROME),
    ),
  );
</script>

<!--
  Палитра — ряд примыкающих полосок в одной рамке. Высота блока совпадает с
  высотой кнопок, полей и выпадающих списков дизайн-системы (`h-9` = 2.25rem):
  палитра стоит в одном ряду с ними и не должна выглядеть мельче. Выбранный
  цвет и цвет под курсором шире и выше остальных: блок имеет фиксированную
  ширину, поэтому расширение плашки забирает место у соседей и общий размер
  блока не меняется. Рамка и скругление взяты из токенов, как у полей и списков.
-->
<div
  class={cn(
    'bg-card inline-flex h-9 items-center gap-[0.1875rem] rounded-[var(--radius)] border border-[var(--input)] p-1',
    size === 'sm' && 'h-8 gap-[0.125rem] p-[0.1875rem]',
    className,
  )}
  style="width: {pickerWidth}px"
  role="group"
  aria-label={ariaLabel}
  data-testid={`${testIdPrefix}-picker`}
>
  {#each colors as color (color.id)}
    <button
      type="button"
      class="min-w-0 flex-1 basis-0 cursor-pointer rounded-[0.25rem] transition-all duration-100 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none {color.selected
        ? size === 'sm'
          ? 'h-5 grow-[1.8]'
          : 'h-6 grow-[1.8]'
        : size === 'sm'
          ? 'h-4 grow hover:h-5 hover:grow-[1.8]'
          : 'h-5 grow hover:h-6 hover:grow-[1.8]'}"
      style="background: {color.value}"
      title={color.label}
      aria-label={color.label}
      aria-pressed={color.selected ? 'true' : 'false'}
      data-testid="{testIdPrefix}-{color.id}"
      onclick={() => onpick(color.id)}
    ></button>
  {/each}
</div>
