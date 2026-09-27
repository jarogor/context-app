<script lang="ts">
  import { cn } from '../utils';

  interface Props {
    /** Доля выполнения в процентах (0–100). */
    value: number;
    /** Дополнительные классы. */
    class?: string;
  }

  let { value, class: className = '' }: Props = $props();

  /** Ограниченное значение в процентах. */
  const clamped = $derived(Math.max(0, Math.min(100, Math.round(value))));
</script>

<div
  class={cn(
    'h-2 w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)]',
    className,
  )}
  role="progressbar"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={clamped}
>
  <div
    class="h-full rounded-[var(--radius-lg)] bg-[var(--color-primary)] transition-[width] duration-200"
    style:width={`${clamped}%`}
  ></div>
</div>
