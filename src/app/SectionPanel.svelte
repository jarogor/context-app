<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Панель раздела.
   *
   * Полоса над содержимым: заголовок текущего раздела, необязательный поиск и
   * главное действие именно этого раздела. Показывает контекст «где я» и даёт
   * одно основное действие, вместо ряда равнозначных иконок.
   */
  interface Props {
    /** Заголовок текущего раздела. */
    title: string;
    /** Подпись-контекст под заголовком (например, имя источника). */
    subtitle?: string;
    /** Поиск раздела. */
    search?: Snippet;
    /** Главное действие раздела. */
    action?: Snippet;
    /** Дополнительные действия (вторичные). */
    extra?: Snippet;
    /** Метка заголовка для тестов. */
    titleTestId?: string;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    title,
    subtitle = '',
    search,
    action,
    extra,
    titleTestId,
    class: className = '',
  }: Props = $props();
</script>

<header
  class="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5 {className}"
  data-testid="section-panel"
>
  <div class="flex min-w-0 flex-col">
    <span
      class="truncate role-title text-[var(--foreground)]"
      data-testid={titleTestId}
    >{title}</span>
    {#if subtitle}
      <span class="truncate role-caption text-[var(--muted-foreground)]">{subtitle}</span>
    {/if}
  </div>

  <div class="ml-auto flex min-w-0 flex-wrap items-center gap-2">
    {#if search}
      <div class="w-[16rem] max-w-full">{@render search()}</div>
    {/if}
    {#if extra}
      {@render extra()}
    {/if}
    {#if action}
      {@render action()}
    {/if}
  </div>
</header>
