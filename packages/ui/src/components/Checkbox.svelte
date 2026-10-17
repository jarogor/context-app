<script lang="ts">
  import { Checkbox as CheckboxPrimitive } from 'bits-ui';
  import { cn } from '../utils';
  import Icon from './Icon.svelte';

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

  /** Передача изменения в совместимом с прежним контрактом виде.
   *
   * Потребители читают значение как `event.currentTarget.checked`, поэтому
   * примитив Bits UI (колбэк `onCheckedChange`) оборачивается в объект-событие.
   */
  function handleChange(value: boolean) {
    onchange?.({
      currentTarget: { checked: value },
    } as unknown as Event & { currentTarget: HTMLInputElement });
  }
</script>

<CheckboxPrimitive.Root
  bind:checked
  {id}
  {disabled}
  onCheckedChange={handleChange}
  class={cn(
    'border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
>
  {#snippet children({ checked })}
    <span class="text-current">
      {#if checked}
        <Icon name="check" class="h-3.5 w-3.5" />
      {/if}
    </span>
  {/snippet}
</CheckboxPrimitive.Root>
