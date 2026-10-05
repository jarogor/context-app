<script lang="ts" module>
  /** Вариант выбора в выпадающем списке. */
  export interface SelectOption {
    /** Машинное значение. */
    value: string;
    /** Отображаемая подпись. */
    label: string;
    /** Недоступность варианта. */
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui';
  import { cn } from '../utils';

  interface Props {
    /** Текущее значение. */
    value?: string;
    /** Варианты выбора. */
    items: SelectOption[];
    /** Подпись, когда значение не выбрано. */
    placeholder?: string;
    /** Идентификатор для label. */
    id?: string;
    /** Недоступность. */
    disabled?: boolean;
    /** Компактный размер триггера для панелей. */
    size?: 'md' | 'sm';
    /** Дополнительные классы триггера. */
    class?: string;
    /** Метка доступности триггера. */
    ariaLabel?: string;
    /** Обработчик выбора значения. */
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(''),
    items,
    placeholder,
    id,
    disabled = false,
    size = 'md',
    class: className = '',
    ariaLabel,
    onchange,
  }: Props = $props();

  /** Передача выбранного значения потребителю. */
  function handleValueChange(next: string) {
    onchange?.(next);
  }
</script>

<SelectPrimitive.Root
  type="single"
  {items}
  bind:value
  {disabled}
  onValueChange={handleValueChange}
>
  <SelectPrimitive.Trigger
    {id}
    aria-label={ariaLabel}
    class={cn(
      'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 data-[placeholder]:text-muted-foreground box-border flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-3 shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm' ? 'h-8 text-[12px]' : 'h-9 text-sm',
      className,
    )}
  >
    <SelectPrimitive.Value {placeholder} class="truncate text-left" />
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      class="text-muted-foreground shrink-0"
    >
      <path
        d="m6 9 6 6 6-6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </SelectPrimitive.Trigger>
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      class="border-border bg-popover text-popover-foreground z-50 max-h-[var(--bits-select-content-available-height)] min-w-[var(--bits-select-anchor-width)] overflow-hidden rounded-md border shadow-md"
      sideOffset={4}
    >
      <SelectPrimitive.Viewport class="p-1">
        {#each items as item (item.value)}
          <SelectPrimitive.Item
            value={item.value}
            label={item.label}
            disabled={item.disabled}
            class="data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-[6px] text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
          >
            {#snippet children({ selected })}
              <span class="flex-1 truncate text-left">{item.label}</span>
              {#if selected}
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" class="shrink-0">
                  <path
                    d="M20 6 9 17l-5-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              {/if}
            {/snippet}
          </SelectPrimitive.Item>
        {/each}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
</SelectPrimitive.Root>
