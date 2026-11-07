<script lang="ts" module>
  import { type VariantProps, tv } from 'tailwind-variants';

  /** Варианты оформления кнопки «Печатного листа».
   *
   * Три веса действия вместо ряда равнозначных кнопок: `primary` — главное
   * действие раздела (одно на экран), `secondary` — обычное, `ghost` —
   * вспомогательное внутри плотных панелей. Опасные действия выделены отдельно.
   * На указателе-пальце (`pointer: coarse`) размеры поднимаются до сенсорной
   * цели (`pointer-coarse:min-h-11` = 44px).
   */
  export const buttonVariants = tv({
    base: 'focus-visible:border-ring focus-visible:ring-ring/35 aria-invalid:border-destructive inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow,transform] outline-none focus-visible:ring-[3px] active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:brightness-110',
        secondary:
          'bg-card text-foreground border border-[var(--border)] hover:bg-surface-hover',
        ghost: 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
        danger: 'bg-destructive text-destructive-foreground hover:brightness-110',
        'ghost-danger':
          'border border-[var(--border)] text-destructive hover:bg-destructive-soft hover:border-destructive-border',
      },
      size: {
        md: 'h-9 px-4 py-2 pointer-coarse:min-h-11',
        sm: 'h-8 gap-1.5 px-3 pointer-coarse:min-h-11',
        icon: 'size-9 [&_svg]:size-[1.125em] pointer-coarse:size-11',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  });

  /** Допустимые варианты кнопки. */
  export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Вариант оформления. */
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ghost-danger';
    /** Размер кнопки. */
    size?: 'md' | 'sm' | 'icon';
    /** Тип кнопки. */
    type?: 'button' | 'submit';
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
    /** Подпись-подсказка. */
    title?: string;
    /** Метка доступности. */
    ariaLabel?: string;
    /** Идентификатор для тестов. */
    testId?: string;
    /** Состояние нажатой (активной) кнопки. */
    ariaPressed?: boolean;
    /** Признак текущего элемента набора (`aria-current`). */
    ariaCurrent?: 'page';
    /** Обработчик нажатия. */
    onclick?: (event: MouseEvent) => void;
    /** Содержимое кнопки. */
    children: Snippet;
  }

  let {
    variant = 'secondary',
    size = 'md',
    type = 'button',
    disabled = false,
    class: className = '',
    title,
    ariaLabel,
    testId,
    ariaPressed,
    ariaCurrent,
    onclick,
    children,
  }: Props = $props();
</script>

<button
  {type}
  {disabled}
  {title}
  aria-label={ariaLabel}
  aria-pressed={ariaPressed}
  aria-current={ariaCurrent}
  data-testid={testId}
  {onclick}
  class={cn(buttonVariants({ variant, size }), className)}
>
  {@render children()}
</button>
