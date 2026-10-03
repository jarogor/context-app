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
    'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive box-border h-9 rounded-md border px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
>
  {@render children()}
</select>
