<script lang="ts" module>
  import { type VariantProps, tv } from 'tailwind-variants';

  /** Варианты оформления значка по стандарту shadcn-svelte. */
  export const badgeVariants = tv({
    base: 'focus-visible:border-ring focus-visible:ring-ring/50 inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow]',
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground border-transparent',
        muted: 'bg-muted text-muted-foreground border-transparent',
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
    variant?: 'default' | 'muted';
    /** Дополнительные классы. */
    class?: string;
    /** Содержимое. */
    children: Snippet;
  }

  let { variant = 'muted', class: className = '', children }: Props = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)}>
  {@render children()}
</span>
