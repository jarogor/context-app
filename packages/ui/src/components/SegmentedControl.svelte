<script lang="ts" module>
  import type { IconName } from './Icon.svelte';

  /** Вариант переключателя: значение, подпись и иконка. */
  export interface SegmentedItem {
    /** Машинное значение варианта. */
    value: string;
    /** Подпись варианта для подсказки и доступного имени. */
    label: string;
    /** Иконка варианта. */
    icon: IconName;
  }
</script>

<script lang="ts">
  import { cn } from '../utils';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    /** Варианты переключения. */
    items: SegmentedItem[];
    /** Текущее значение. */
    value: string;
    /** Метка группы для доступного имени. */
    ariaLabel: string;
    /** Обработчик выбора варианта. */
    onchange: (value: string) => void;
    /** Дополнительные классы контейнера. */
    class?: string;
  }

  let { items, value, ariaLabel, onchange, class: className = '' }: Props = $props();
</script>

<!--
  Переключатель вариантов — блок в общей рамке, который стоит в полосе
  управления рядом с кнопками, полями и списками и обязан совпадать с ними по
  высоте. Высота блока задана явно (`h-9`, на грубом указателе `h-11`), а
  внутренняя кнопка заполняет её за вычетом отступа: кнопка следует шкале
  интерфейса и не отстаёт от блока на больших мониторах, где шкала растёт.
  Ширина кнопки равна высоте — квадрат внутри блока, поэтому отступ сверху и
  снизу одинаков. Иконка и скругление уменьшены (по правилу вложенного угла:
  радиус внутри меньше внешнего на отступ), поэтому блок не выглядит крупнее
  соседей и не выбивается из полосы.
-->
<div
  class={cn(
    'inline-flex h-9 shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5 pointer-coarse:h-11',
    className,
  )}
  role="group"
  aria-label={ariaLabel}
>
  {#each items as item (item.value)}
    <Button
      variant={value === item.value ? 'primary' : 'ghost'}
      size="icon"
      title={item.label}
      ariaLabel={item.label}
      ariaPressed={value === item.value}
      class="aspect-square h-full w-auto min-w-0 shrink-0 rounded-[calc(var(--radius)-0.125rem)] [&_svg]:size-[0.9375em] pointer-coarse:h-full"
      onclick={() => onchange(item.value)}
    >
      <Icon name={item.icon} />
    </Button>
  {/each}
</div>
