<script lang="ts" module>
  /** Значение списка фильтра: значение, подпись и число книг. */
  export interface FilterListItem {
    /** Машинное значение. */
    value: string;
    /** Подпись для интерфейса. */
    label: string;
    /** Сколько книг имеют это значение. */
    count?: number;
  }
</script>

<script lang="ts">
  import Checkbox from './Checkbox.svelte';
  import Input from './Input.svelte';

  /**
   * Список значений фильтра с поиском и флажками.
   *
   * Один компонент на все фасеты: у длинных списков (авторы, теги) появляется
   * поиск, у коротких (форматы, языки) он не нужен и не показывается. Список
   * прокручивается внутри себя, чтобы не растягивать панель.
   */
  interface Props {
    /** Возможные значения. */
    items: FilterListItem[];
    /** Выбранные значения. */
    selected: string[];
    /** Переключение значения. */
    onToggle: (value: string) => void;
    /** Подсказка поиска по значениям. */
    searchPlaceholder: string;
    /** Текст, когда поиск ничего не нашёл. */
    emptyText: string;
    /** Метка списка для тестов. */
    testId?: string;
    /** Сколько значений видно до прокрутки (по умолчанию — пять). */
    visibleRows?: number;
  }

  let {
    items,
    selected,
    onToggle,
    searchPlaceholder,
    emptyText,
    testId,
    visibleRows = 5,
  }: Props = $props();

  /** Строка поиска по значениям списка. */
  let query = $state('');

  /** Значения с учётом поиска. */
  const visible = $derived.by(() => {
    const text = query.trim().toLowerCase();
    return text ? items.filter((item) => item.label.toLowerCase().includes(text)) : items;
  });

  /** Искать есть смысл только в длинном списке. */
  const searchable = $derived(items.length > visibleRows);

  /** Высота видимой части списка: ровно столько строк, сколько задано.
   *
   * Считается, а не берётся «на глаз»: строка — флажок с подписью и отступами,
   * поэтому высота списка совпадает с целым числом строк, и половина строки не
   * обрезается. Поиск над списком в высоту не входит — он не прокручивается.
   */
  const listHeight = $derived(`calc(${visibleRows} * 2.125rem)`);
</script>

<div class="flex flex-col gap-1" data-testid={testId}>
  {#if searchable}
    <Input
      bind:value={query}
      placeholder={searchPlaceholder}
      ariaLabel={searchPlaceholder}
      icon="search"
      clearable
    />
  {/if}
  <div class="flex flex-col overflow-y-auto" style="max-height: {listHeight}">
    {#each visible as item (item.value)}
      <label
        class="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 hover:bg-[var(--surface-hover)]"
      >
        <Checkbox checked={selected.includes(item.value)} onchange={() => onToggle(item.value)} />
        <span class="min-w-0 flex-1 truncate role-body">{item.label}</span>
        {#if item.count !== undefined}
          <span class="role-caption text-[var(--muted-foreground)]">{item.count}</span>
        {/if}
      </label>
    {/each}
    {#if visible.length === 0}
      <p class="m-0 px-2 py-1.5 role-caption text-[var(--muted-foreground)]">{emptyText}</p>
    {/if}
  </div>
</div>
