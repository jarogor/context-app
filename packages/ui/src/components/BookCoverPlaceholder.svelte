<script lang="ts">
  import { cn } from '../utils';

  interface Props {
    /** Дополнительные классы. */
    class?: string;
  }

  let { class: className = '' }: Props = $props();
</script>

<div
  class={cn(
    'flex aspect-[2/3] w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
    className,
  )}
  aria-hidden="true"
>
  <svg viewBox="0 0 24 24" width="40%" height="40%" fill="none">
    <path
      d="M5 4.5A1.5 1.5 0 0 1 6.5 3H15l4 4v12.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15Z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
    <path d="M14.5 3v4.5H19" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
  </svg>
</div>
