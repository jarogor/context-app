<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '@context/i18n';
  import type { IconName } from './Icon.svelte';
  import ScrollArea from './ScrollArea.svelte';
  import EmptyState from './EmptyState.svelte';
  import ErrorState from './ErrorState.svelte';
  import Skeleton from './Skeleton.svelte';

  /**
   * Каркас страницы-раздела «Печатного листа».
   *
   * Раздел читается сверху вниз тремя независимыми слоями, и каждый включается
   * только там, где нужен:
   * - **шапка** — надзаголовок, заголовок-антиква, пояснение и главное действие;
   * - **полоса управления** — поиск и фильтры раздела (не прокручивается);
   * - **содержимое** — то, что прокручивается, с общим пределом ширины.
   *
   * Раскладку содержимого задаёт сама страница: каркас не навязывает «форму
   * слева, список справа». Список, сетка карточек, двухпанельный просмотр —
   * это решение страницы, а не общего каркаса.
   */
  interface Props {
    /** Надзаголовок (короткая метка раздела). */
    eyebrow?: string;
    /** Заголовок раздела. */
    title?: string;
    /** Пояснение под заголовком. */
    subtitle?: string;
    /** Главное действие и вспомогательные кнопки раздела. */
    actions?: Snippet;
    /** Средства управления (поиск, фильтры) — под шапкой над содержимым. */
    controls?: Snippet;
    /** Содержимое страницы, когда нет состояний загрузки, ошибки или пустоты. */
    children?: Snippet;
    /** Боковая область страницы: справа от содержимого, под шапкой и полосой управления. */
    side?: Snippet;
    /** Идёт загрузка содержимого. */
    loading?: boolean;
    /** Ошибка загрузки содержимого (пустая строка — ошибки нет). */
    error?: string;
    /** Повтор неудачной операции (показывает кнопку повтора в состоянии ошибки). */
    onRetry?: () => void;
    /** Содержимое пусто. */
    empty?: boolean;
    /** Иконка пустого состояния. */
    emptyIcon?: IconName;
    /** Заголовок пустого состояния (если не задано встроенное содержимое). */
    emptyTitle?: string;
    /** Действие пустого состояния. */
    emptyAction?: Snippet;
    /** Содержимое состояния загрузки (переопределяет встроенное). */
    loadingContent?: Snippet;
    /** Содержимое состояния ошибки (переопределяет встроенное). */
    errorContent?: Snippet;
    /** Содержимое пустого состояния (переопределяет встроенное). */
    emptyContent?: Snippet;
    /** Текст встроенного состояния загрузки. */
    loadingText?: string;
    /** Текст встроенного пустого состояния. */
    emptyText?: string;
    /** Метка состояния загрузки для тестов. */
    loadingTestId?: string;
    /** Метка состояния ошибки для тестов. */
    errorTestId?: string;
    /** Метка пустого состояния для тестов. */
    emptyTestId?: string;
    /** Метка страницы для тестов. */
    testId?: string;
    /** Дополнительные классы области прокрутки. */
    class?: string;
    /**
     * Ширина содержимого: `content` — общий предел страницы (по умолчанию),
     * `full` — вся доступная ширина окна. Полная ширина нужна разделам, где
     * список и карточка делят пространство и предел оставлял бы пустоту справа.
     */
    width?: 'content' | 'full';
  }

  let {
    eyebrow = '',
    title = '',
    subtitle = '',
    actions,
    controls,
    children,
    side,
    loading = false,
    error = '',
    onRetry,
    empty = false,
    emptyIcon,
    emptyTitle = '',
    emptyAction,
    loadingContent,
    errorContent,
    emptyContent,
    loadingText,
    emptyText = '',
    loadingTestId,
    errorTestId,
    emptyTestId,
    testId,
    class: className = '',
    width = 'content',
  }: Props = $props();

  /** Текущее состояние содержимого каркаса. */
  const state = $derived(loading ? 'loading' : error ? 'error' : empty ? 'empty' : 'content');
</script>

{#snippet content()}
  {#if state === 'loading'}
    {#if loadingContent}
      {@render loadingContent()}
    {:else}
      <Skeleton rows={4} testId={loadingTestId} />
      {#if loadingText}
        <p class="mt-2 role-caption text-[var(--muted-foreground)]" aria-hidden="true">
          {loadingText ?? t('app.loading')}
        </p>
      {/if}
    {/if}
  {:else if state === 'error'}
    {#if errorContent}
      {@render errorContent()}
    {:else}
      <ErrorState message={error} onretry={onRetry} testId={errorTestId} />
    {/if}
  {:else if state === 'empty'}
    {#if emptyContent}
      {@render emptyContent()}
    {:else}
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle || emptyText}
        action={emptyAction}
        testId={emptyTestId}
      />
    {/if}
  {:else if children}
    {@render children()}
  {/if}
{/snippet}

<div class="flex min-h-0 min-w-0 flex-1 flex-col" data-testid={testId}>
  {#if eyebrow || title || subtitle || actions}
    <header
      class="flex flex-none flex-wrap items-end gap-x-4 gap-y-2 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3 md:px-6"
      data-testid="page-header"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        {#if eyebrow}
          <span class="role-eyebrow text-[var(--muted-foreground)]">{eyebrow}</span>
        {/if}
        {#if title}
          <h1 class="truncate role-display text-[var(--foreground)]" data-testid="page-title">
            {title}
          </h1>
        {/if}
        {#if subtitle}
          <span class="truncate role-body text-[var(--muted-foreground)]">{subtitle}</span>
        {/if}
      </div>
      {#if actions}
        <div class="flex min-w-0 flex-wrap items-center gap-2">{@render actions()}</div>
      {/if}
    </header>
  {/if}

  {#if controls}
    <div
      class="flex flex-none flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-2.5 md:px-6"
      data-testid="page-controls"
    >
      {@render controls()}
    </div>
  {/if}

  <div class="relative flex min-h-0 min-w-0 flex-1">
    <ScrollArea class={className}>
      <div
        class="flex w-full flex-col gap-4 px-4 py-4 md:px-6 md:py-5 {width === 'full'
          ? 'h-full min-h-0'
          : 'max-w-[var(--content-max-width)]'}"
      >
        {@render content()}
      </div>
    </ScrollArea>
    {@render side?.()}
  </div>
</div>
