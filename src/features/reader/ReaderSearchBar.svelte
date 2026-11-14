<script lang="ts">
  import { t } from '@context/i18n';
  import { onMount } from 'svelte';
  import { Button, Icon, SearchField } from '@context/ui';
  import type { SearchState } from './search-state';

  /** Поле поиска по книге в панели книги.
   *
   * Поиск выполняет область чтения: текучая книга ищется по главам, плагин
   * формата — по текстовому слою страниц. Панель только принимает запрос,
   * показывает счётчик и просит перейти к соседнему вхождению.
   *
   * Поле — общий компонент поиска приложения: лупа и кнопка очистки в нём уже
   * есть, и здесь они ведут себя так же, как в остальных списках.
   */

  interface Props {
    /** Текущий запрос. */
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
  }: Props = $props();

  /** Есть ли вхождения для перехода. */
  const canStep = $derived(search.total > 0);

  /** Подпись счётчика: «2 из 17» или пусто, пока нечего показывать. */
  const counter = $derived(
    search.total > 0 && search.index !== null
      ? t('app.reader.search.counter', { index: search.index + 1, total: search.total })
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
    // Поиск открывается действием или кнопкой: печатать запрос нужно сразу.
    searchField?.focus();
  });
</script>

<div
  class="flex flex-col gap-2 p-2"
  data-testid="reader-search"
  role="search"
  aria-label={t('app.reader.searchShort')}
>
  <div class="flex items-center gap-1">
    <div class="min-w-0 flex-1">
      <SearchField
        value={query}
        placeholder={t('app.reader.search.placeholder')}
        ariaLabel={t('app.reader.search.placeholder')}
        clearable
        bind:element={searchField}
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
