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
    /** Доступное имя поля для программ чтения с экрана. */
    ariaLabel?: string;
    /** Число видимых строк. */
    rows?: number;
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
    ariaLabel,
    rows,
    class: className = '',
    oninput,
  }: Props = $props();
</script>

<textarea
  {id}
  {placeholder}
  {disabled}
  {rows}
  aria-label={ariaLabel}
  bind:value
  {oninput}
  spellcheck="false"
  class={cn(
    'border-[var(--input)] bg-card placeholder:text-muted-foreground hover:border-[var(--muted-foreground)] focus-visible:border-ring focus-visible:ring-ring/35 aria-invalid:border-destructive box-border w-full rounded-[var(--radius)] border px-3 py-2 text-sm transition-[color,box-shadow,border-color] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
></textarea>
