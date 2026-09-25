<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Метка доступности меню. */
    ariaLabel?: string;
    /** Дополнительные классы. */
    class?: string;
    /** Пункты меню. */
    children: Snippet;
  }

  let { ariaLabel, class: className = '', children }: Props = $props();
</script>

<nav
  aria-label={ariaLabel}
  class={cn('flex flex-col gap-[var(--space-1)]', className)}
>
  {@render children()}
</nav>
