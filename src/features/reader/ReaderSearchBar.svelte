<script lang="ts">
  import { t } from '@context/i18n';
  import { onMount } from 'svelte';
  import { Button, Icon, Input } from '@context/ui';
  import type { SearchState } from './search-state';

  /** Панель поиска по книге, общая для всех форматов чтения.
   *
   * Поиск выполняет область чтения: встроенное чтение ищет по главам книги, а
   * плагин формата — по текстовому слою страниц. Панель только принимает запрос,
   * показывает счётчик и просит перейти к соседнему вхождению, поэтому её вид
   * одинаков во всех форматах, а логика поиска живёт там, где есть текст.
   *
   * Панель стоит поверх области чтения: книга остаётся видимой, поиск не
   * сдвигает текст и не занимает место в колонке.
   */

  interface Props {
    /** Текущий запрос (двусторонняя привязка). */
    query?: string;
    /** Состояние поиска: сколько найдено и к какому вхождению ведёт переход. */
    state: SearchState;
    /** Идёт ли поиск (медленный формат отвечает не сразу). */
    busy?: boolean;
    /** Ошибка поиска. */
    error?: string | null;
    /** Изменение запроса. */
    onQuery?: (value: string) => void;
    /** Переход к соседнему вхождению. */
    onStep?: (delta: 1 | -1) => void;
    /** Закрытие панели. */
    onClose?: () => void;
  }

  let {
    query = '',
    // Внутри компонента проп называется `search`: имя `state` конфликтует с
    // руной Svelte `$state`.
    state: search,
    busy = false,
    error = null,
    onQuery,
    onStep,
    onClose,
  }: Props = $props();

  /** Есть ли вхождения для перехода. */
  const canStep = $derived(search.total > 0);

  /** Подпись счётчика: «2 из 17» или пусто, пока нечего показывать. */
  const counter = $derived(
    search.total > 0 && search.index !== null
      ? t('app.reader.search.counter', { index: search.index + 1, total: search.total })
      : search.total > 0
        ? String(search.total)
        : '',
  );

  /** Сообщение о результате: пустой запрос молчит, найденное показывает счётчик. */
  const hint = $derived(
    error
      ? error
      : busy
        ? t('app.reader.search.searching')
        : search.total === 0 && query.trim()
          ? t('app.reader.search.notFound')
          : search.truncated
            ? t('app.reader.search.truncated', { total: search.total })
            : '',
  );

  /** Поле ввода: при открытии поиска курсор сразу в нём. */
  let searchField = $state<HTMLInputElement | undefined>();

  onMount(() => {
    // Панель открывается по кнопке поиска: печатать запрос нужно сразу, без
    // лишнего клика в поле.
    searchField?.focus();
  });
</script>

<div
  class="absolute right-2 top-2 z-[var(--layer-popup)] flex w-[min(24rem,calc(100%-1rem))] flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--overlay-surface)] p-1.5 shadow-overlay"
  data-testid="reader-search"
  role="search"
  aria-label={t('app.reader.searchShort')}
>
  <!--
    Поле занимает всё доступное место строки до кнопок. Счётчик стоит в подсказке
    под полем и только когда он есть: в строке он занимал бы место даже без
    результата и оставлял пустоту справа от поля.
  -->
  <div class="flex items-center gap-1">
    <div class="min-w-0 flex-1">
      <Input
        bind:element={searchField}
        value={query}
        placeholder={t('app.reader.search.placeholder')}
        ariaLabel={t('app.reader.search.placeholder')}
        class="h-8"
        oninput={(event) => onQuery?.(event.currentTarget.value)}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            onStep?.(event.shiftKey ? -1 : 1);
          }
        }}
      />
    </div>
    <Button
      variant="ghost"
      size="icon"
      title={t('app.reader.search.prev')}
      ariaLabel={t('app.reader.search.prev')}
      class="size-8"
      disabled={!canStep}
      testId="reader-search-prev"
      onclick={() => onStep?.(-1)}
    >
      <Icon name="chevron-up" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      title={t('app.reader.search.next')}
      ariaLabel={t('app.reader.search.next')}
      class="size-8"
      disabled={!canStep}
      testId="reader-search-next"
      onclick={() => onStep?.(1)}
    >
      <Icon name="chevron-down" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      title={t('app.reader.search.close')}
      ariaLabel={t('app.reader.search.close')}
      class="size-8"
      onclick={() => onClose?.()}
    >
      <Icon name="close" />
    </Button>
  </div>
  {#if counter || hint}
    <div class="flex items-center gap-2 px-1 text-xs text-[var(--muted-foreground)]">
      {#if counter}
        <span
          class="shrink-0 whitespace-nowrap [font-variant-numeric:tabular-nums]"
          data-testid="reader-search-counter"
          >{counter}</span
        >
      {/if}
      {#if hint}
        <span class="min-w-0" data-testid="reader-search-hint">{hint}</span>
      {/if}
    </div>
  {/if}
</div>
