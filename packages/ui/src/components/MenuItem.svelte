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
    'cursor-pointer rounded-[var(--radius-md)] border px-[var(--space-3)] py-[var(--space-2)] text-left text-sm [font:inherit] disabled:cursor-not-allowed disabled:opacity-50',
    active
      ? 'border-[var(--color-border-strong)] bg-[var(--color-accent)] font-semibold text-[var(--color-primary)]'
      : 'border-transparent bg-transparent text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]',
    className,
  )}
>
  {@render children()}
</button>
