<script lang="ts">
  import { cn } from '../utils';

  interface Props {
    /** Текущее значение. */
    value?: string;
    /** Тип поля. */
    type?: string;
    /** Плейсхолдер. */
    placeholder?: string;
    /** Идентификатор для label. */
    id?: string;
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
    /** Обработчик ввода. */
    oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
    /** Обработчик нажатия клавиши. */
    onkeydown?: (event: KeyboardEvent) => void;
  }

  let {
    value = $bindable(''),
    type = 'text',
    placeholder = '',
    id,
    disabled = false,
    class: className = '',
    oninput,
    onkeydown,
  }: Props = $props();
</script>

<input
  {id}
  {type}
  {placeholder}
  {disabled}
  bind:value
  {oninput}
  {onkeydown}
  class={cn(
    'box-border h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-2)] text-sm text-[var(--color-text)] [font:inherit] disabled:opacity-50',
    className,
  )}
/>
