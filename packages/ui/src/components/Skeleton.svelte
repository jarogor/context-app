<script lang="ts">
  import { cn } from '../utils';

  /**
   * Скелетон загрузки в форме будущего содержимого.
   *
   * Показывает заданное число строк-заглушек вместо слова «Загрузка…»: там, где
   * строение содержимого известно, пользователь видит форму будущего результата.
   */
  interface Props {
    /** Число строк-заглушек. */
    rows?: number;
    /** Высота одной строки (классы размера, например `h-9`). */
    rowClass?: string;
    /** Метка для тестов. */
    testId?: string;
    /** Дополнительные классы контейнера. */
    class?: string;
  }

  import { t } from '@context/i18n';

  let {
    rows = 3,
    rowClass = 'h-9',
    testId,
    class: className = '',
  }: Props = $props();

  /** Индексы строк для отрисовки заглушек. */
  const indices = $derived(Array.from({ length: Math.max(1, rows) }, (_, index) => index));
</script>

<div
  class={cn('flex flex-col gap-2', className)}
  data-testid={testId}
  role="status"
  aria-label={t('app.skeleton.loading')}
>
  {#each indices as index (index)}
    <div
      class={cn(
        'animate-pulse rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]',
        rowClass,
      )}
      aria-hidden="true"
    ></div>
  {/each}
</div>
