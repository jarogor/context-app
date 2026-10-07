<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import ListRow from './ListRow.svelte';
  import MetaList, { type MetaItem } from './MetaList.svelte';
  import ActionMenu, { type MenuAction } from './ActionMenu.svelte';
  import { cn } from '../utils';

  interface Props {
    /** Элементы списка в порядке показа. */
    items: T[];
    /** Ключ элемента для сопоставления при обновлении. */
    key: (item: T) => string;
    /** Название пункта (акцентная строка). */
    titleContent: Snippet<[T]>;
    /** Метаинформация пункта из общего `MetaList`. */
    metaItems?: (item: T) => MetaItem[];
    /** Метка для тестов у блока метаинформации. */
    metaTestId?: string;
    /** Содержимое в конце строки названия, перед действиями. */
    trailing?: Snippet<[T]>;
    /** Пункты контекстного меню действий пункта. */
    actions?: (item: T) => MenuAction[];
    /** Подпись доступности меню действий. */
    actionsLabel?: string;
    /** Обработчик выбора пункта меню действий. */
    onAction?: (item: T, action: string) => void;
    /** Обработчик клика по пункту. */
    onSelect?: (item: T) => void;
    /** Пункт отмечен как текущий/выбранный. */
    selected?: (item: T) => boolean;
    /** Пункт недоступен. */
    disabled?: (item: T) => boolean;
    /** Состояние раскрытия пункта. */
    expanded?: (item: T) => boolean;
    /** Пункт находится в режиме встроенного редактирования. */
    isEditing?: (item: T) => boolean;
    /** Содержимое вместо строки в режиме редактирования. */
    editContent?: Snippet<[T]>;
    /** Дополнительное содержимое под строкой (например, раскрытый список). */
    body?: Snippet<[T]>;
    /** Контейнер списка: `ul` (со `li`) или `div` (с `section`). */
    container?: 'ul' | 'div';
    /** Метка для тестов у каждого пункта. */
    itemTestId?: string;
    /** Метка для тестов у кликабельной области пункта. */
    buttonTestId?: string;
    /** Поиск не дал результатов при непустом источнике. */
    notFound?: boolean;
    /** Текст состояния «ничего не найдено». */
    notFoundText?: string;
    /** Метка состояния «ничего не найдено» для тестов. */
    notFoundTestId?: string;
    /** Дополнительные классы контейнера. */
    class?: string;
  }

  let {
    items,
    key,
    titleContent: title,
    metaItems,
    metaTestId,
    trailing: trailingContent,
    actions: actionsFor,
    actionsLabel,
    onAction,
    onSelect,
    selected,
    disabled,
    expanded,
    isEditing,
    editContent,
    body,
    container = 'ul',
    itemTestId,
    buttonTestId,
    notFound = false,
    notFoundText = 'Ничего не найдено.',
    notFoundTestId,
    class: className = '',
  }: Props = $props();
</script>

{#snippet listRow(item: T)}
  <ListRow
    selected={selected?.(item) ?? false}
    disabled={disabled?.(item) ?? false}
    expanded={expanded?.(item)}
    buttonTestId={buttonTestId}
    onclick={onSelect ? () => onSelect(item) : undefined}
  >
    {#snippet titleContent()}
      {@render title(item)}
    {/snippet}

    {#snippet meta()}
      {#if metaItems}
        <span class="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={metaTestId}>
          <MetaList items={metaItems(item)} />
        </span>
      {/if}
    {/snippet}

    {#snippet trailing()}
      {#if trailingContent}
        {@render trailingContent(item)}
      {/if}
    {/snippet}

    {#snippet actions()}
      {#if actionsFor}
        <ActionMenu
          ariaLabel={actionsLabel ?? 'Действия'}
          title="Действия"
          items={actionsFor(item)}
          onselect={(action) => onAction?.(item, action)}
        />
      {/if}
    {/snippet}
  </ListRow>
{/snippet}

{#if notFound}
  <p class="text-[var(--muted-foreground)]" data-testid={notFoundTestId}>{notFoundText}</p>
{:else if container === 'div'}
  <div class={cn('flex flex-col gap-2', className)}>
    {#each items as item (key(item))}
      <section class="flex flex-col gap-2" data-testid={itemTestId}>
        {@render listRow(item)}
        {#if body}
          {@render body(item)}
        {/if}
      </section>
    {/each}
  </div>
{:else}
  <ul class={cn('flex list-none flex-col gap-2 p-0', className)}>
    {#each items as item (key(item))}
      <li data-testid={itemTestId}>
        {#if isEditing?.(item) && editContent}
          {@render editContent(item)}
        {:else}
          {@render listRow(item)}
        {/if}
      </li>
    {/each}
  </ul>
{/if}
