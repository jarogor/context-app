<script lang="ts">
  import { cn } from '../utils';

  /**
   * Скелетон загрузки в форме будущего содержимого.
   *
   * Показывает заданное число строк-заглушек вместо слова «Загрузка…»: там, где
   * строение содержимого известно (список строк, панель), пользователь видит
   * форму будущего результата, а не пустое поле, и интерфейс не «прыгает» при
   * появлении данных.
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
  aria-label="Загрузка"
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
