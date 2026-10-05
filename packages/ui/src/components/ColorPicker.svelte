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
    /** Дополнительные классы контейнера. */
    class?: string;
  }

  let {
    colors,
    onpick,
    ariaLabel = 'Цвет',
    testIdPrefix = 'color',
    class: className = '',
  }: Props = $props();

  /** Ширина блока палитры: при наведении плашки перераспределяются внутри неё,
   * а сам блок не меняет размер и не сдвигает соседний интерфейс. */
  const pickerWidth = $derived(colors.length * 14 + Math.max(0, colors.length - 1) * 3 + 8);
</script>

<!--
  Палитра — ряд примыкающих полосок в одной рамке. Выбранный цвет и цвет под
  курсором шире и выше остальных: блок имеет фиксированную ширину, поэтому
  расширение плашки забирает место у соседей и общий размер блока не меняется
  (раньше блок рос при наведении и толкал соседний интерфейс). Невыбранный
  образец ниже полной высоты на 2 px сверху и снизу (`h-4` против `h-5`):
  разница по высоте вместе с шириной делает состояние выразительнее, а выбор и
  наведение восстанавливают полную высоту. Рамка и скругление взяты из
  дизайн-токенов, как у полей и выпадающих списков.
-->
<div
  class={cn(
    'inline-flex items-center gap-[3px] rounded-md border border-[var(--input)] bg-[var(--card)] p-1',
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
      class="min-w-0 flex-1 basis-0 cursor-pointer rounded-[4px] transition-all duration-100 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none {color.selected
        ? 'h-5 grow-[1.8]'
        : 'h-4 grow hover:h-5 hover:grow-[1.8]'}"
      style="background: {color.value}"
      title={color.label}
      aria-label={color.label}
      aria-pressed={color.selected ? 'true' : 'false'}
      data-testid="{testIdPrefix}-{color.id}"
      onclick={() => onpick(color.id)}
    ></button>
  {/each}
</div>
