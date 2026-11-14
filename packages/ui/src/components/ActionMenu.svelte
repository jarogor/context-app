<script lang="ts" module>
  /** Пункт меню действий. */
  export interface MenuAction {
    /** Идентификатор действия. */
    id: string;
    /** Отображаемая подпись. */
    label: string;
    /** Значок слева от подписи; подпись остаётся главным носителем смысла. */
    icon?: IconName;
    /** Отделить пункт от предыдущих: делит меню на смысловые группы. */
    separatorBefore?: boolean;
    /**
     * Значок опасного действия: красный цвет темы.
     *
     * Подпись остаётся обычной, предупреждает именно значок — так пункт не
     * читается как недоступный и при этом привлекает внимание к последствиям.
     */
    dangerIcon?: boolean;
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
  import { t } from '@context/i18n';
  import { cn } from '../utils';
  import { buttonVariants } from './Button.svelte';
  import ColorPicker from './ColorPicker.svelte';
  import Icon, { type IconName } from './Icon.svelte';
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
    /** Идентификатор триггера для тестов. */
    testId?: string;
    /**
     * Триггер без собственной плашки: видна только иконка и подсветка при
     * наведении и нажатии.
     *
     * Нужно там, где меню стоит внутри элемента со своим фоном (например, на
     * цветной вкладке): рамка и заливка кнопки спорили бы с ним.
     */
    plain?: boolean;
  }

  let {
    items,
    onselect,
    colors = [],
    oncolorselect,
    colorsLabel,
    icons = [],
    oniconselect,
    iconsLabel,
    ariaLabel,
    title,
    disabled = false,
    class: className = '',
    testId,
    plain = false,
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
      // Без плашки кнопка наследует и фон, и цвет владельца: на цветной вкладке
      // значок остаётся контрастным ей, а не спорит с ней собственной заливкой.
      plain
        ? 'border-transparent bg-transparent text-current shadow-none hover:bg-[var(--surface-hover)] data-[state=open]:bg-[var(--surface-selected)]'
        : 'text-[var(--muted-foreground)]',
      className,
    ),
  );
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger
    {disabled}
    {title}
    aria-label={ariaLabel}
    data-testid={testId}
    class={triggerClass}
  >
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
      {#if colors.length > 0 || icons.length > 0}
        <!--
          Цвет и иконка — единый блок оформления. У палитр нет рамок, а фон общий,
          поэтому они стоят друг под другом внутри одного блока без промежутка:
          стык фонов не виден, и выбор цвета с выбором иконки читается одним
          блоком, а не двумя соседними.
        -->
        <div class="flex flex-col overflow-hidden rounded-[var(--radius)] bg-[var(--card)]">
          {#if colors.length > 0}
            <ColorPicker
              colors={swatches}
              onpick={pickColor}
              ariaLabel={colorsLabel ?? t('app.color.choose')}
              testIdPrefix="menu-color"
            />
          {/if}
          {#if icons.length > 0}
            <IconPicker
              icons={iconSwatches}
              onpick={pickIcon}
              ariaLabel={iconsLabel ?? t('app.icon.choose')}
              testIdPrefix="menu-icon"
            />
          {/if}
        </div>
      {/if}
      {#if (colors.length > 0 || icons.length > 0) && items.length > 0}
        <div class="bg-[var(--border)] -mx-1 my-1 h-px"></div>
      {/if}
      {#each items as item (item.id)}
        {#if item.separatorBefore && item.id !== items[0]?.id}
          <div class="bg-[var(--border)] -mx-1 my-1 h-px" aria-hidden="true"></div>
        {/if}
        <DropdownMenu.Item
          disabled={item.disabled}
          onSelect={() => onselect?.(item.id)}
          class={cn(
            'data-[highlighted]:bg-surface-hover flex cursor-pointer items-center rounded-sm px-2 py-[0.375rem] text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
            item.destructive &&
              'text-destructive data-[highlighted]:bg-destructive-soft data-[highlighted]:text-destructive',
          )}
        >
          {#if item.icon}
            <!-- Значок стоит слева в своей колонке: подписи пунктов выровнены
                 друг по другу независимо от того, есть ли у пункта значок. -->
            <Icon
              name={item.icon}
              class={cn(
                'mr-2 size-4 shrink-0',
                item.dangerIcon ? 'text-[var(--destructive)] opacity-100' : 'opacity-70',
              )}
            />
          {/if}
          {item.label}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
