<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  /**
   * Группа команд в одной рамке.
   *
   * Тот же блок, что у `SegmentedControl`: общая подложка, скругление и высота
   * базового контрола, внутри — иконочные кнопки, разделённые узким зазором.
   * Отличие только в смысле: сегменты показывают выбранное значение, а здесь
   * собраны разные действия над одним объектом — правка, перемещение, закрытие.
   * Поэтому выбор не подсвечивается, а каждая кнопка остаётся самостоятельной.
   *
   * Группа нужна там, где несколько кнопок относятся к одному предмету: набор
   * кнопок с общей рамкой читается одним блоком и не занимает ширину ряда
   * отдельных кнопок с отступами между ними.
   */
  interface Props {
    /** Метка группы для доступного имени. */
    ariaLabel: string;
    /** Идентификатор для тестов. */
    testId?: string;
    /** Дополнительные классы контейнера. */
    class?: string;
    /** Кнопки группы. */
    children: Snippet;
  }

  let { ariaLabel, testId, class: className = '', children }: Props = $props();
</script>

<div
  class={cn(
    'inline-flex h-9 shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5 pointer-coarse:h-11',
    className,
  )}
  role="group"
  aria-label={ariaLabel}
  data-testid={testId}
>
  {@render children()}
</div>
