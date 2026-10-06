<script lang="ts" module>
  import type { IconName } from './Icon.svelte';
</script>

<script lang="ts">
  import Icon from './Icon.svelte';
  import { cn } from '../utils';

  interface Props {
    /** Текущее значение. */
    value?: string;
    /** Тип поля. */
    type?: string;
    /** Плейсхолдер. */
    placeholder?: string;
    /** Доступное имя поля (aria-label). */
    ariaLabel?: string;
    /** Идентификатор для label. */
    id?: string;
    /** Иконка внутри поля слева. */
    icon?: IconName;
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
    ariaLabel,
    id,
    icon,
    disabled = false,
    class: className = '',
    oninput,
    onkeydown,
  }: Props = $props();

  /** Базовые стили поля, общие для варианта с иконкой и без. */
  const fieldClass =
    'border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive box-border h-9 w-full min-w-0 rounded-md border text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50';
</script>

{#if icon}
  <div class={cn('relative', className)}>
    <Icon
      name={icon}
      class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
    />
    <input
      {id}
      {type}
      {placeholder}
      {disabled}
      aria-label={ariaLabel}
      bind:value
      {oninput}
      {onkeydown}
      class={cn(fieldClass, 'pl-8 pr-3 py-1')}
    />
  </div>
{:else}
  <input
    {id}
    {type}
    {placeholder}
    {disabled}
    aria-label={ariaLabel}
    bind:value
    {oninput}
    {onkeydown}
    class={cn(fieldClass, 'px-3 py-1', className)}
  />
{/if}
