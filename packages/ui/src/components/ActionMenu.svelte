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

  /** Образец выбора цвета в меню. */
  export interface MenuColor {
    /** Идентификатор цвета, передаваемый в обработчик выбора. */
    id: string;
    /** Подпись цвета для доступности и подсказки. */
    label: string;
    /** CSS-значение цвета образца. */
    color: string;
    /** Выбран ли цвет в данный момент. */
    selected?: boolean;
  }

  /** Образец выбора иконки в меню. */
  export interface MenuIcon {
    /** Идентификатор иконки, передаваемый в обработчик выбора. */
    id: string;
    /** Подпись иконки для доступности и подсказки. */
    label: string;
    /** Выбрана ли иконка в данный момент. */
    selected?: boolean;
  }
</script>

<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { cn } from '../utils';
  import { buttonVariants } from './Button.svelte';
  import ColorPicker from './ColorPicker.svelte';
  import Icon from './Icon.svelte';
  import IconPicker from './IconPicker.svelte';

  interface Props {
    /** Пункты меню. */
    items: MenuAction[];
    /** Обработчик выбора пункта. */
    onselect?: (id: string) => void;
    /** Строка выбора цвета над пунктами меню. */
    colors?: MenuColor[];
    /** Обработчик выбора цвета. */
    oncolorselect?: (id: string) => void;
    /** Метка доступности строки цветов. */
    colorsLabel?: string;
    /** Сетка выбора иконки над пунктами меню. */
    icons?: MenuIcon[];
    /** Обработчик выбора иконки. */
    oniconselect?: (id: string) => void;
    /** Метка доступности сетки иконок. */
    iconsLabel?: string;
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
    colors = [],
    oncolorselect,
    colorsLabel = 'Выбор цвета',
    icons = [],
    oniconselect,
    iconsLabel = 'Выбор иконки',
    ariaLabel,
    title,
    disabled = false,
    class: className = '',
  }: Props = $props();

  /** Состояние раскрытия меню: закрываем после выбора цвета. */
  let open = $state(false);

  /** Образцы палитры в форме общего компонента выбора цвета. */
  const swatches = $derived(
    colors.map((color) => ({
      id: color.id,
      label: color.label,
      value: color.color,
      selected: color.selected,
    })),
  );

  /** Образцы иконок в форме общего компонента выбора иконки. */
  const iconSwatches = $derived(
    icons.map((icon) => ({
      id: icon.id,
      label: icon.label,
      selected: icon.selected,
    })),
  );

  /** Выбор цвета и закрытие меню. */
  function pickColor(id: string): void {
    oncolorselect?.(id);
    open = false;
  }

  /** Выбор иконки и закрытие меню. */
  function pickIcon(id: string): void {
    oniconselect?.(id);
    open = false;
  }

  /** Стили кнопки меню: тонкая рамка, как у прочих иконочных действий. */
  const triggerClass = $derived(
    cn(
      buttonVariants({ variant: 'secondary', size: 'icon' }),
      'text-[var(--muted-foreground)]',
      className,
    ),
  );
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger {disabled} {title} aria-label={ariaLabel} class={triggerClass}>
    <Icon name="more" />
  </DropdownMenu.Trigger>
  <!-- Всплывающий слой приподнимается мягкой тенью: меню читается отрывом от
       подложки на любом фоне, без контурной обводки. -->
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      sideOffset={4}
      align="end"
      class="border-[var(--border)] bg-[var(--overlay-surface)] text-popover-foreground z-50 min-w-[11.25rem] overflow-hidden rounded-md border p-1 shadow-overlay"
    >
      {#if colors.length > 0}
        <div class="px-1.5 py-[0.375rem]">
          <ColorPicker
            colors={swatches}
            onpick={pickColor}
            ariaLabel={colorsLabel}
            testIdPrefix="menu-color"
          />
        </div>
      {/if}
      {#if icons.length > 0}
        <div class="px-1.5 py-[0.375rem]">
          <IconPicker
            icons={iconSwatches}
            onpick={pickIcon}
            ariaLabel={iconsLabel}
            testIdPrefix="menu-icon"
          />
        </div>
      {/if}
      {#if (colors.length > 0 || icons.length > 0) && items.length > 0}
        <div class="bg-[var(--border)] -mx-1 my-1 h-px"></div>
      {/if}
      {#each items as item (item.id)}
        <DropdownMenu.Item
          disabled={item.disabled}
          onSelect={() => onselect?.(item.id)}
          class={cn(
            'data-[highlighted]:bg-surface-hover flex cursor-pointer items-center rounded-sm px-2 py-[0.375rem] text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
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
