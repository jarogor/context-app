<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Дополнительные классы. */
    class?: string;
    /** Содержимое панели. */
    children: Snippet;
  }

  let { class: className = '', children }: Props = $props();
</script>

<div
  class={cn(
    'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]',
    className,
  )}
>
  {@render children()}
</div>
