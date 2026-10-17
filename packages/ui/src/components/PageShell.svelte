<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconName } from './Icon.svelte';
  import ScrollArea from './ScrollArea.svelte';
  import EmptyState from './EmptyState.svelte';
  import ErrorState from './ErrorState.svelte';
  import Skeleton from './Skeleton.svelte';

  interface Props {
    /** Содержимое страницы, когда нет состояний загрузки, ошибки или пустоты. */
    children?: Snippet;
    /** Панель действий над содержимым (в режиме формы — под формой в левой колонке). */
    toolbar?: Snippet;
    /** Панель формы: на широком окне — колонка слева, на узком — сверху. */
    form?: Snippet;
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
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    children,
    toolbar,
    form,
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
    loadingText = 'Загрузка…',
    emptyText = '',
    loadingTestId,
    errorTestId,
    emptyTestId,
    testId,
    class: className = '',
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
          {loadingText}
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

<ScrollArea
  testId={testId}
  class={className}
>
  <div
    class="flex w-full max-w-[var(--content-max-width)] flex-col gap-4 px-4 py-5 md:px-6 md:py-6"
  >
    {#if form}
      <div class="flex flex-col gap-4 @min-[44rem]:flex-row @min-[44rem]:items-start @min-[44rem]:gap-6">
        <div class="flex flex-col gap-3 @min-[44rem]:w-[20rem] @min-[44rem]:flex-none">
          {@render form()}
          {#if toolbar}
            <div class="flex flex-col gap-3">{@render toolbar()}</div>
          {/if}
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          {@render content()}
        </div>
      </div>
    {:else}
      {#if toolbar}
        <div class="flex flex-col gap-3">{@render toolbar()}</div>
      {/if}
      {@render content()}
    {/if}
  </div>
</ScrollArea>
