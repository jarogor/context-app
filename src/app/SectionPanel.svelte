<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Панель контекста раздела.
   *
   * Полоса между верхней панелью и содержимым: надзаголовок (где я), заголовок
   * раздела-антиква, пояснение-контекст (например, открытая библиотека) и
   * главное действие именно этого раздела. Показывает контекст и даёт одно
   * основное действие, вместо ряда равнозначных иконок.
   */
  interface Props {
    /** Надзаголовок (короткая метка раздела). */
    eyebrow?: string;
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
    eyebrow = '',
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
  class="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 md:px-6 {className}"
  data-testid="section-panel"
>
  <div class="flex min-w-0 flex-col">
    {#if eyebrow}
      <span class="role-eyebrow text-[var(--muted-foreground)]">{eyebrow}</span>
    {/if}
    <span
      class="truncate role-heading text-[var(--foreground)]"
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
