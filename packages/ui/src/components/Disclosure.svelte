<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { cn } from '../utils';

  /**
   * Сворачиваемый раздел.
   *
   * Заголовок — кнопка с треугольником: раздел открывается и закрывается
   * пользователем, а содержимое занимает место только когда нужно. Так длинные
   * наборы (авторы, свойства книги) не превращаются в портянку.
   */
  interface Props {
    /** Заголовок раздела. */
    title: string;
    /** Открыт ли раздел (по умолчанию закрыт). */
    open?: boolean;
    /** Пометка справа от заголовка (например, число выбранных значений). */
    badge?: Snippet;
    /** Действия в заголовке (например, правка раздела). */
    actions?: Snippet;
    /** Содержимое раздела. */
    children: Snippet;
    /** Метка раздела для тестов. */
    testId?: string;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    title,
    open = $bindable(false),
    badge,
    actions,
    children,
    testId,
    class: className = '',
  }: Props = $props();
</script>

<section class={cn('flex flex-col', className)} data-testid={testId}>
  <div class="flex items-center gap-1">
    <button
      type="button"
      class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left transition-colors [font:inherit] hover:bg-[var(--surface-hover)] pointer-coarse:min-h-11"
      aria-expanded={open}
      title={title}
      onclick={() => (open = !open)}
    >
      <Icon
        name={open ? 'chevron-down' : 'chevron-right'}
        class="h-4 w-4 shrink-0 text-[var(--muted-foreground)]"
      />
      <span class="min-w-0 flex-1 truncate role-body">{title}</span>
      {#if badge}
        {@render badge()}
      {/if}
    </button>
    {#if actions}
      {@render actions()}
    {/if}
  </div>
  {#if open}
    <div class="px-2 pt-1 pb-2">
      {@render children()}
    </div>
  {/if}
</section>
