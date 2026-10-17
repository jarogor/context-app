<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Выбранный пункт. */
    active?: boolean;
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
    /** Обработчик выбора. */
    onclick?: (event: MouseEvent) => void;
    /** Содержимое пункта. */
    children: Snippet;
  }

  let {
    active = false,
    disabled = false,
    class: className = '',
    onclick,
    children,
  }: Props = $props();
</script>

<button
  type="button"
  {disabled}
  aria-current={active ? 'page' : undefined}
  {onclick}
  class={cn(
    'cursor-pointer border-l-2 px-3 py-2 text-left text-sm transition-colors [font:inherit] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11',
    active
      ? 'border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--foreground)]'
      : 'border-transparent text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]',
    className,
  )}
>
  {@render children()}
</button>
