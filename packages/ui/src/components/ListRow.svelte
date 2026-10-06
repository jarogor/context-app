<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Обработчик клика по пункту; без него пункт не интерактивен. */
    onclick?: (event: MouseEvent) => void;
    /** Пункт отмечен как текущий/выбранный. */
    selected?: boolean;
    /** Состояние раскрытия (для раскрываемых пунктов). */
    expanded?: boolean;
    /** Пункт недоступен. */
    disabled?: boolean;
    /** Метка доступности интерактивного пункта. */
    ariaLabel?: string;
    /** Подпись-подсказка. */
    title?: string;
    /** Метка для тестов. */
    testId?: string;
    /** Метка для тестов у кликабельной области (кнопки). */
    buttonTestId?: string;
    /** Название пункта (акцентная строка). */
    titleContent: Snippet;
    /** Содержимое в конце строки названия, перед действиями (например, счётчик). */
    trailing?: Snippet;
    /** Метаинформация под названием. */
    meta?: Snippet;
    /** Действия пункта (контекстное меню); показываются в конце строки. */
    actions?: Snippet;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    onclick,
    selected = false,
    expanded,
    disabled = false,
    ariaLabel,
    title,
    testId,
    buttonTestId,
    titleContent,
    trailing,
    meta,
    actions,
    class: className = '',
  }: Props = $props();

  /** Обводка строки и выделение текущего пункта — общие для всех списков. */
  const surface = $derived(
    cn(
      'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] transition-colors',
      selected ? 'bg-[var(--primary-soft)]' : '',
    ),
  );
</script>

<div
  class={cn(surface, 'flex items-stretch', className)}
  data-testid={testId}
  data-selected={selected ? 'true' : undefined}
>
  <button
    type="button"
    data-testid={buttonTestId}
    class={cn(
      'flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2.5 text-left [font:inherit]',
      onclick && !disabled ? 'cursor-pointer hover:bg-[var(--muted)]' : 'cursor-default',
      selected && onclick && !disabled ? 'hover:bg-[var(--primary-soft)]' : '',
      disabled ? 'cursor-not-allowed opacity-60' : '',
    )}
    {disabled}
    aria-label={ariaLabel}
    {title}
    aria-current={selected ? 'true' : undefined}
    aria-expanded={expanded}
    {onclick}
  >
    <span class="flex min-w-0 items-center gap-2">
      {@render titleContent()}
      {#if trailing}
        <span class="ml-auto flex shrink-0 items-center gap-2">{@render trailing()}</span>
      {/if}
    </span>
    {#if meta}
      {@render meta()}
    {/if}
  </button>

  {#if actions}
    <div class="flex shrink-0 items-center p-2">{@render actions()}</div>
  {/if}
</div>
