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

  const variants: Record<string, string> = {
    default: 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]',
    muted: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
  };
</script>

<span
  class={cn(
    'inline-block rounded-[var(--radius-lg)] px-[var(--space-2)] py-[2px] text-[11px]',
    variants[variant],
    className,
  )}
>
  {@render children()}
</span>
