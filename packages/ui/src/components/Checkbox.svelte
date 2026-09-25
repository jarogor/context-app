<script lang="ts">
  import { cn } from '../utils';

  interface Props {
    /** Состояние флажка. */
    checked?: boolean;
    /** Идентификатор для label. */
    id?: string;
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
    /** Обработчик изменения. */
    onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
  }

  let {
    checked = $bindable(false),
    id,
    disabled = false,
    class: className = '',
    onchange,
  }: Props = $props();
</script>

<input
  {id}
  type="checkbox"
  {disabled}
  bind:checked
  {onchange}
  class={cn(
    'h-4 w-4 rounded-[var(--radius-sm)] border-[var(--color-border-strong)] text-[var(--color-primary)] disabled:opacity-50',
    className,
  )}
/>
