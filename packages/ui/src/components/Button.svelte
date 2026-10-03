<script lang="ts" module>
  import { type VariantProps, tv } from 'tailwind-variants';

  /** Варианты оформления кнопки по стандарту shadcn-svelte. */
  export const buttonVariants = tv({
    base: 'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
        secondary:
          'bg-background hover:bg-accent hover:text-accent-foreground border shadow-xs',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        danger: 'bg-destructive hover:bg-destructive/90 text-white shadow-xs',
      },
      size: {
        md: 'h-9 px-4 py-2',
        sm: 'h-8 gap-1.5 px-3',
        icon: 'size-9',
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
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
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
    /** Состояние нажатой (активной) кнопки. */
    ariaPressed?: boolean;
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
    ariaPressed,
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
  {onclick}
  class={cn(buttonVariants({ variant, size }), className)}
>
  {@render children()}
</button>
