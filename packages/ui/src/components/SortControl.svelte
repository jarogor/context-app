<script lang="ts" module>
  /** Направление порядка: по возрастанию или по убыванию. */
  export type SortDirection = 'asc' | 'desc';

  /** Вариант поля порядка в выпадающем списке. */
  export interface SortOption {
    /** Машинное значение поля. */
    value: string;
    /** Подпись варианта. */
    label: string;
  }
</script>

<script lang="ts">
  import { t } from '@context/i18n';
  import { cn } from '../utils';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Select from './Select.svelte';

  /**
   * Порядок списка: поле и направление одним контролом.
   *
   * Выбор поля и переключение направления — одно действие пользователя над
   * списком, поэтому оба элемента собраны в **общий блок** с одной рамкой и
   * фоном: видно, что кнопка относится к сортировке, а не стоит сама по себе.
   * Внутри блока выпадающий список не рисует собственной рамки — она принадлежит
   * блоку.
   *
   * Иконка направления — `sort-asc`/`sort-desc` (стрелка и убывающие линии), а
   * не `chevron`: треугольник уже означает «раскрыть список» и на кнопке рядом
   * со списком читался бы как второй такой же раскрыватель.
   */
  interface Props {
    /** Варианты поля порядка. */
    items: SortOption[];
    /** Выбранное поле. */
    value: string;
    /** Текущее направление. */
    direction: SortDirection;
    /** Доступное имя выпадающего списка. */
    ariaLabel: string;
    /** Выбор поля порядка. */
    onchange: (value: string) => void;
    /**
     * Переключение направления.
     *
     * Передаётся новое направление, а не флаг: потребитель не вычисляет его
     * сам и не может разойтись с показанной кнопкой.
     */
    ondirection: (direction: SortDirection) => void;
    /** Метка для тестов: блок получает её, кнопка — `<метка>-direction`. */
    testId?: string;
    /** Дополнительные классы блока. */
    class?: string;
    /** Ширина выпадающего списка внутри блока. */
    selectClass?: string;
  }

  let {
    items,
    value,
    direction,
    ariaLabel,
    onchange,
    ondirection,
    testId = 'sort',
    class: className = '',
    selectClass = '',
  }: Props = $props();

  /** Направление, которое поставит нажатие кнопки. */
  const nextDirection: SortDirection = $derived(direction === 'asc' ? 'desc' : 'asc');

  /**
   * Подпись кнопки направления: называет сторону, на которую она переключит.
   *
   * Показывается действие, а не текущее состояние: по иконке видна сторона
   * порядка, а по подсказке — что произойдёт по нажатию.
   */
  const directionLabel = $derived(
    nextDirection === 'asc' ? t('app.sort.asc') : t('app.sort.desc'),
  );

  /** Иконка показывает текущее направление. */
  const directionIcon = $derived(direction === 'asc' ? 'sort-asc' : 'sort-desc');
</script>

<!--
  Один блок на оба элемента: рамка, фон и высота — как у остальных контролов
  полосы (`h-9`, на грубом указателе `h-11`). Список стоит слева без своей
  рамки, кнопка направления — справа вплотную: это части одного управления
  порядком, а не два соседних.
-->
<div
  class={cn(
    'inline-flex h-9 min-w-0 shrink-0 items-center gap-0.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-0.5 pointer-coarse:h-11',
    className,
  )}
  data-testid={testId}
>
  <Select
    {value}
    {items}
    {ariaLabel}
    class={cn(
      'h-full min-w-0 border-0 bg-transparent px-2 hover:border-0 focus-visible:ring-0',
      selectClass,
    )}
    onchange={(next) => onchange(next)}
  />
  <span class="h-4 w-px shrink-0 self-center bg-[var(--divider)]" aria-hidden="true"></span>
  <Button
    variant="ghost"
    size="icon"
    title={directionLabel}
    ariaLabel={directionLabel}
    testId="{testId}-direction"
    class="size-[1.875rem] rounded-[calc(var(--radius)-0.125rem)] [&_svg]:size-[0.9375em] pointer-coarse:size-[2.375rem]"
    onclick={() => ondirection(nextDirection)}
  >
    <Icon name={directionIcon} />
  </Button>
</div>
