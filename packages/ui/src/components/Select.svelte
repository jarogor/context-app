<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Текущее значение. */
    value?: string;
    /** Идентификатор для label. */
    id?: string;
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
    /** Обработчик изменения. */
    onchange?: (event: Event & { currentTarget: HTMLSelectElement }) => void;
    /** Варианты выбора. */
    children: Snippet;
  }

  let {
    value = $bindable(''),
    id,
    disabled = false,
    class: className = '',
    onchange,
    children,
  }: Props = $props();
</script>

<select
  {id}
  {disabled}
  bind:value
  {onchange}
  class={cn(
    'box-border h-9 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-2)] text-sm text-[var(--color-text)] [font:inherit] disabled:opacity-50',
    className,
  )}
>
  {@render children()}
</select>
