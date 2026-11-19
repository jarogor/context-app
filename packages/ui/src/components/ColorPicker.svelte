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

  import { t } from '@context/i18n';

  let {
    colors,
    onpick,
    ariaLabel,
    testIdPrefix = 'color',
    size = 'md',
    class: className = '',
  }: Props = $props();

  /** Базовая ширина невыбранного образца в долях шкалы интерфейса.
   *
   * Образцы делят ширину блока по весам `flex-grow`: выбранный забирает долю
   * `SELECTED_GROW`, прочие — по единице. Отсюда базовая ширина блока. Доли
   * шкалы (`--spacing`), а не пиксели: на широких мониторах шкала растёт, и
   * палитра должна расти вместе с полями и кнопками. */
  const SWATCH_WIDTH = 4;
  /** Зазор между образцами в долях шкалы. */
  const SWATCH_GAP = 0.75;
  /** Во сколько раз выбранный образец шире невыбранного. */
  const SELECTED_GROW = 1.8;
  /** Внутренние отступы блока по обеим сторонам в долях шкалы: по 8 px справа и
   * слева при базовой шкале.
   *
   * Боковой отступ равен вертикальному (высота блока минус высота плашки), поэтому
   * крайние образцы отстоят от границ ровно на столько же, на сколько плашки от
   * верхнего и нижнего края. */
  const PICKER_CHROME = 4;

  /** Компактные значения тех же величин: палитра для тесных панелей. */
  const COMPACT_SWATCH_WIDTH = 3;
  const COMPACT_SWATCH_GAP = 0.5;
  const COMPACT_PICKER_CHROME = 4;

  /** Ширина блока палитры в долях шкалы: при наведении плашки перераспределяются
   * внутри неё, а сам блок не меняет размер и не сдвигает соседний интерфейс. */
  const pickerWidth = $derived(
    Number(
      (
        (size === 'sm' ? COMPACT_SWATCH_WIDTH : SWATCH_WIDTH) *
          (colors.length - 1 + SELECTED_GROW) +
        Math.max(0, colors.length - 1) * (size === 'sm' ? COMPACT_SWATCH_GAP : SWATCH_GAP) +
        (size === 'sm' ? COMPACT_PICKER_CHROME : PICKER_CHROME)
      ).toFixed(2),
    ),
  );
</script>

<!--
  Палитра — ряд примыкающих полосок. Высота блока совпадает с высотой кнопок,
  полей и выпадающих списков дизайн-системы (`h-9`): палитра стоит в одном ряду
  с ними и не должна выглядеть мельче. Выбранный цвет и цвет под курсором шире и
  выше остальных: блок имеет фиксированную ширину, поэтому расширение плашки
  забирает место у соседей и общий размер блока не меняется.
  Ширина считается в долях шкалы интерфейса (как высота и отступы), а не в
  пикселях: на широких мониторах шкала растёт, и палитра растёт вместе с ней.
  Собственной рамки у палитры нет: она стоит внутри меню и всплывающего слоя,
  которые уже отделены от подложки, и лишний контур только спорил с их обводкой.
  Боковой отступ шире вертикального ровно на столько, чтобы крайние образцы
  отстояли от краёв так же, как от верхней и нижней границы.
-->
<div
  class={cn(
    'inline-flex h-9 items-center gap-[calc(var(--spacing)*0.75)] rounded-[var(--radius)] bg-[var(--control-surface)] px-2 py-1',
    size === 'sm' && 'h-8 gap-[calc(var(--spacing)*0.5)] px-2 py-[0.1875rem]',
    className,
  )}
  style="width: calc(var(--spacing) * {pickerWidth})"
  role="group"
  aria-label={ariaLabel ?? t('app.color.label')}
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
