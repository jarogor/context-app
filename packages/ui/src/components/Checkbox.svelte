<script lang="ts">
  import { Checkbox as CheckboxPrimitive } from 'bits-ui';
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
    'border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
>
  {#snippet children({ checked })}
    <span class="text-current">
      {#if checked}
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 6 9 17l-5-5"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      {/if}
    </span>
  {/snippet}
</CheckboxPrimitive.Root>
