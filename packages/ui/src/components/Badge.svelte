<script lang="ts" module>
  import { type VariantProps, tv } from 'tailwind-variants';

  /** Варианты оформления значка «Печатного листа».
   *
   * Значок — метка, а не кнопка: тип, состояние, сорт. `default` — акцентный,
   * `muted` — приглушённый, `outline` — тонкий контур без заливки, `success` и
   * `warning` — состояния. */
  export const badgeVariants = tv({
    base: ' focus-visible:ring-ring/50 inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full  px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow]',
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground ',
        muted: 'bg-muted text-muted-foreground ',
        outline: ' text-muted-foreground bg-transparent',
        success: ' bg-[var(--success)] text-[var(--primary-foreground)]',
        warning: ' bg-[var(--warning)] text-[var(--primary-foreground)]',
      },
    },
    defaultVariants: {
      variant: 'muted',
    },
  });

  /** Допустимые варианты значка. */
  export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Вариант оформления. */
    variant?: 'default' | 'muted' | 'outline' | 'success' | 'warning';
    /** Дополнительные классы. */
    class?: string;
    /** Inline-стиль: цвет метки данных (например, цвет элемента списка). */
    style?: string;
    /** Подпись-подсказка. */
    title?: string;
    /** Метка для тестов. */
    testId?: string;
    /** Содержимое. */
    children: Snippet;
  }

  let {
    variant = 'muted',
    class: className = '',
    style,
    title,
    testId,
    children,
  }: Props = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)} {style} {title} data-testid={testId}>
  {@render children()}
</span>
