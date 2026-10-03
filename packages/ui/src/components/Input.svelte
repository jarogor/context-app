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
    'border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive box-border h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
/>
