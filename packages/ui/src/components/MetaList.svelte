<script lang="ts" module>
  import type { IconName } from './Icon.svelte';

  /** Элемент метаинформации пункта списка: иконка/подпись и значение. */
  export interface MetaItem {
    /** Иконка перед значением; заменяет подпись, когда дата одна. */
    icon?: IconName;
    /** Короткая метка перед значением вместо иконки (например, формат файла). */
    badge?: string;
    /** Подпись-контекст (например, «Изменён»); нужна, когда дат несколько. */
    label?: string;
    /** Значение метаинформации. */
    value: string;
    /** Выделить значение (например, «текущее»). */
    strong?: boolean;
    /** Показать значение моноширинным шрифтом как целое (путь к файлу). */
    mono?: boolean;
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
    'flex flex-wrap items-center gap-x-3 gap-y-1 role-caption text-[var(--muted-foreground)]',
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
      {#if item.badge}
        <!-- Метка вместо иконки: короткое служебное значение (формат файла). -->
        <span
          class="shrink-0 rounded-[calc(var(--radius)*0.5)] border border-current/40 px-[0.4em] text-[0.85em] leading-[1.5] tracking-wide"
          data-testid={`${item.testId ?? 'meta'}-badge`}
        >
          {item.badge}
        </span>
      {/if}
      {#if item.label}
        <span class="shrink-0">{item.label}</span>
      {/if}
      <span
        class={cn(
          'min-w-0 truncate',
          item.strong ? 'font-medium text-[var(--foreground)]' : '',
          item.mono
            ? 'rounded-[calc(var(--radius)*0.5)] bg-[var(--surface-inset)] px-1 font-mono text-[0.95em]'
            : '',
        )}
        data-testid={item.testId}
      >
        {item.value}
      </span>
    </span>
  {/each}
</div>
