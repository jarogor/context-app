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
  {onclick}
  class={cn(
    'cursor-pointer rounded-md border px-3 py-2 text-left text-sm [font:inherit] disabled:cursor-not-allowed disabled:opacity-50',
    active
      ? 'border-border bg-accent text-accent-foreground font-semibold'
      : 'hover:bg-primary-soft border-transparent bg-transparent text-primary',
    className,
  )}
>
  {@render children()}
</button>
