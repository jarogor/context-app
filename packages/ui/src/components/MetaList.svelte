<script lang="ts" module>
  import type { IconName } from './Icon.svelte';

  /** Элемент метаинформации пункта списка: иконка/подпись и значение. */
  export interface MetaItem {
    /** Иконка перед значением; заменяет подпись, когда дата одна. */
    icon?: IconName;
    /** Подпись-контекст (например, «Изменён»); нужна, когда дат несколько. */
    label?: string;
    /** Значение метаинформации. */
    value: string;
    /** Выделить значение (например, «текущее»). */
    strong?: boolean;
    /** Подсказка; по умолчанию совпадает со значением. */
    title?: string;
    /** Метка значения для тестов. */
    testId?: string;
  }
</script>

<script lang="ts">
  import Icon from './Icon.svelte';
  import { cn } from '../utils';

  interface Props {
    /** Элементы метаинформации в порядке показа. */
    items: MetaItem[];
    /** Дополнительные классы. */
    class?: string;
  }

  let { items, class: className = '' }: Props = $props();
</script>

<div
  class={cn(
    'flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-[var(--muted-foreground)]',
    className,
  )}
>
  {#each items as item, index (index)}
    <span
      class="inline-flex min-w-0 items-center gap-1"
      title={item.title ?? item.value}
      aria-label={item.icon || item.label ? `${item.label ?? ''} ${item.value}`.trim() : undefined}
    >
      {#if item.icon}
        <Icon name={item.icon} class="h-3.5 w-3.5" />
      {/if}
      {#if item.label}
        <span class="shrink-0">{item.label}</span>
      {/if}
      <span
        class={cn(
          'min-w-0 truncate',
          item.strong ? 'font-medium text-[var(--foreground)]' : '',
        )}
        data-testid={item.testId}
      >
        {item.value}
      </span>
    </span>
  {/each}
</div>
