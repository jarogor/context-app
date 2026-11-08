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
  высоте. Высота блока задана явно: `h-9` (2.25rem), на грубом указателе `h-11`
  (2.75rem) — как у остальных контролов полосы. Внутренняя кнопка не «размер
  контрола», а высота блока минус рамка и отступ (`1.875rem`, на грубом
  указателе `2.375rem`). Вместе с ней пропорционально уменьшены ширина, иконка
  и скругление (по правилу вложенного угла: радиус внутри меньше внешнего на
  отступ), поэтому блок не выглядит крупнее соседей и не выбивается из полосы.
-->
<div
  class={cn(
    'inline-flex h-9 shrink-0 items-center gap-0.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-0.5 pointer-coarse:h-11',
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
      class="size-[1.875rem] rounded-[calc(var(--radius)-0.125rem)] [&_svg]:size-[0.9375em] pointer-coarse:size-[2.375rem]"
      onclick={() => onchange(item.value)}
    >
      <Icon name={item.icon} />
    </Button>
  {/each}
</div>
