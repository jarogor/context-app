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

  /** Сторона слота образца в долях шкалы интерфейса.
   *
   * Слот фиксирован: цветная фигура растёт и меняет форму внутри него, поэтому
   * наведение и выбор не переставляют соседей. Доли шкалы, а не пиксели: на
   * широких мониторах шкала растёт, и палитра растёт вместе с полями и кнопками. */
  const SWATCH_SIZE = { md: 5, sm: 4 };
  /** Зазор между слотами в долях шкалы. */
  const SWATCH_GAP = { md: 1, sm: 0.75 };
  /** Боковые отступы блока в долях шкалы: по 8 px с каждой стороны. */
  const PICKER_CHROME = 4;

  /** Ширина блока палитры в долях шкалы.
   *
   * Складывается из слотов, зазоров и боковых отступов, поэтому не зависит от
   * того, какой цвет выбран и на что наведён курсор. */
  const pickerWidth = $derived(
    Number(
      (
        SWATCH_SIZE[size] * colors.length +
        Math.max(0, colors.length - 1) * SWATCH_GAP[size] +
        PICKER_CHROME
      ).toFixed(2),
    ),
  );
</script>

<!--
  Палитра — ряд круглых образцов в слотах фиксированного размера. Высота блока
  совпадает с высотой кнопок, полей и выпадающих списков дизайн-системы (`h-9`):
  палитра стоит в одном ряду с ними и не должна выглядеть мельче.
  Ячейка образца квадратная и прозрачная: круглым рисуется только сам цвет.
  Поэтому наведение срабатывает по всей ячейке, а не по видимому кругу — в
  маленький круг трудно попасть курсором.
  Круг при наведении увеличивается, а выбранный цвет становится квадратом с
  закруглёнными углами: различие читается формой, а не шириной. Растёт только
  фигура внутри слота, поэтому ни наведение, ни выбор не сдвигают соседей и не
  меняют ширину блока.
  Ширина считается в долях шкалы интерфейса (как высота и отступы), а не в
  пикселях: на широких мониторах шкала растёт, и палитра растёт вместе с ней.
  Собственной рамки у палитры нет: она стоит внутри меню и всплывающего слоя,
  которые уже отделены от подложки, и лишний контур только спорил с их обводкой.
-->
<div
  class={cn(
    'inline-flex h-9 items-center gap-[calc(var(--spacing)*1)] rounded-[var(--radius)] bg-[var(--picker-surface)] px-2 py-1',
    size === 'sm' && 'h-8 gap-[calc(var(--spacing)*0.75)] py-[0.1875rem]',
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
      class="group flex shrink-0 cursor-pointer items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none {size ===
      'sm'
        ? 'size-4'
        : 'size-5'}"
      title={color.label}
      aria-label={color.label}
      aria-pressed={color.selected ? 'true' : 'false'}
      data-testid="{testIdPrefix}-{color.id}"
      onclick={() => onpick(color.id)}
    >
      <!--
        Фигура цвета: круг по умолчанию, круг во весь слот при наведении и
        квадрат со скруглением у выбранного. Наведение и выбор дают один размер
        — самый крупный из доступных, поэтому переход к выбору не увеличивает
        фигуру ещё раз. Размеры — доли слота, поэтому форма не выходит за него и
        не влияет на раскладку.
      -->
      <span
        class="transition-[width,height,border-radius] duration-100 {color.selected
          ? 'size-full rounded-[0.25rem]'
          : 'size-[60%] rounded-full group-hover:size-full'}"
        style="background: {color.value}"
        aria-hidden="true"
      ></span>
    </button>
  {/each}
</div>
