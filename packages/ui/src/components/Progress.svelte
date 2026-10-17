<script lang="ts">
  import { Progress as ProgressPrimitive } from 'bits-ui';
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

<ProgressPrimitive.Root
  value={clamped}
  max={100}
  class={cn('bg-[var(--primary-soft)] relative h-1.5 w-full overflow-hidden rounded-full', className)}
>
  <div
    class="bg-primary h-full w-full flex-1 transition-transform duration-200"
    style="transform: translateX(-{100 - clamped}%)"
  ></div>
</ProgressPrimitive.Root>
