<script lang="ts" module>
  /** Пункт меню действий. */
  export interface MenuAction {
    /** Идентификатор действия. */
    id: string;
    /** Отображаемая подпись. */
    label: string;
    /** Опасное действие (удаление). */
    destructive?: boolean;
    /** Недоступность пункта. */
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { cn } from '../utils';
  import { buttonVariants } from './Button.svelte';

  interface Props {
    /** Пункты меню. */
    items: MenuAction[];
    /** Обработчик выбора пункта. */
    onselect?: (id: string) => void;
    /** Метка доступности кнопки-триггера. */
    ariaLabel: string;
    /** Подпись-подсказка триггера. */
    title?: string;
    /** Недоступность триггера. */
    disabled?: boolean;
    /** Дополнительные классы триггера. */
    class?: string;
  }

  let {
    items,
    onselect,
    ariaLabel,
    title,
    disabled = false,
    class: className = '',
  }: Props = $props();

  /** Стили кнопки меню: тонкая рамка, как у прочих иконочных действий. */
  const triggerClass = $derived(
    cn(
      buttonVariants({ variant: 'secondary', size: 'icon' }),
      'text-[var(--muted-foreground)]',
      className,
    ),
  );
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger {disabled} {title} aria-label={ariaLabel} class={triggerClass}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" />
    </svg>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      sideOffset={4}
      align="end"
      class="border-border bg-popover text-popover-foreground z-50 min-w-[180px] overflow-hidden rounded-md border p-1 shadow-md"
    >
      {#each items as item (item.id)}
        <DropdownMenu.Item
          disabled={item.disabled}
          onSelect={() => onselect?.(item.id)}
          class={cn(
            'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground flex cursor-pointer items-center rounded-sm px-2 py-[6px] text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
            item.destructive &&
              'text-destructive data-[highlighted]:bg-destructive-soft data-[highlighted]:text-destructive',
          )}
        >
          {item.label}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
