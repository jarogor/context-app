<script lang="ts">
  import { cn } from '../utils';

  interface Props {
    /** Дополнительные классы. */
    class?: string;
  }

  let { class: className = '' }: Props = $props();
</script>

<svg
  class={cn('h-4 w-4 animate-spin text-[var(--color-text-muted)]', className)}
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25" />
  <path
    d="M12 2a10 10 0 0 1 10 10"
    stroke="currentColor"
    stroke-width="4"
    stroke-linecap="round"
  />
</svg>
