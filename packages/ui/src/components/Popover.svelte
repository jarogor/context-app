<script lang="ts">
  import { Popover as PopoverPrimitive } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  /**
   * Всплывающая панель с произвольным содержимым.
   *
   * Отличается от меню действий назначением: меню — список пунктов одного
   * действия, поповер — небольшая панель с несколькими контролами (масштаб,
   * шрифт, оформление). Панель поднимается над содержимым мягкой тенью и не
   * занимает места в раскладке, поэтому её открытие ничего не сдвигает.
   *
   * Триггер рисует потребитель, а привязки примитива (нажатие, координаты,
   * `aria-expanded`) он ставит на свою кнопку: обёртки и лишней вложенной
   * кнопки не появляется, поэтому доступное имя и состояние остаются у
   * настоящей кнопки.
   */
  interface Props {
    /** Открытость панели (двусторонняя привязка). */
    open?: boolean;
    /** Сторона появления относительно триггера. */
    side?: 'top' | 'bottom' | 'left' | 'right';
    /** Выравнивание относительно триггера. */
    align?: 'start' | 'center' | 'end';
    /** Кнопка-триггер: получает привязки примитива и ставит их на себя. */
    trigger: Snippet<[{ props: Record<string, unknown> }]>;
    /** Содержимое панели. */
    children: Snippet;
    /** Дополнительные классы панели (ширина задаётся здесь). */
    class?: string;
    /** Метка панели для тестов. */
    testId?: string;
  }

  let {
    open = $bindable(false),
    side = 'top',
    align = 'end',
    trigger,
    children,
    class: className = '',
    testId,
  }: Props = $props();
</script>

<PopoverPrimitive.Root bind:open>
  <PopoverPrimitive.Trigger>
    {#snippet child({ props })}
      {@render trigger({ props })}
    {/snippet}
  </PopoverPrimitive.Trigger>
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      {side}
      {align}
      sideOffset={6}
      data-testid={testId}
      class={cn(
        'bg-[var(--menu-surface)] text-popover-foreground z-[var(--layer-popup)] min-w-[12rem] rounded-[var(--radius)] p-2 shadow-overlay outline-none',
        className,
      )}
    >
      {@render children()}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
</PopoverPrimitive.Root>
