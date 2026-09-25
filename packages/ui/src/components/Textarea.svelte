<script lang="ts">
  import { cn } from '../utils';

  interface Props {
    /** Текущее значение. */
    value?: string;
    /** Плейсхолдер. */
    placeholder?: string;
    /** Идентификатор для label. */
    id?: string;
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
    /** Обработчик ввода. */
    oninput?: (event: Event & { currentTarget: HTMLTextAreaElement }) => void;
  }

  let {
    value = $bindable(''),
    placeholder = '',
    id,
    disabled = false,
    class: className = '',
    oninput,
  }: Props = $props();
</script>

<textarea
  {id}
  {placeholder}
  {disabled}
  bind:value
  {oninput}
  spellcheck="false"
  class={cn(
    'box-border w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-2)] text-sm text-[var(--color-text)] [font:inherit] disabled:opacity-50',
    className,
  )}
></textarea>
