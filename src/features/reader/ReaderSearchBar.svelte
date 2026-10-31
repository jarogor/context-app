<script lang="ts">
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
    state,
    busy = false,
    error = null,
    onQuery,
    onStep,
    onClose,
  }: Props = $props();

  /** Есть ли вхождения для перехода. */
  const canStep = $derived(state.total > 0);

  /** Подпись счётчика: «2 из 17» или пусто, пока нечего показывать. */
  const counter = $derived(
    state.total > 0 && state.index !== null
      ? `${state.index + 1} из ${state.total}`
      : state.total > 0
        ? String(state.total)
        : '',
  );

  /** Сообщение о результате: пустой запрос молчит, найденное показывает счётчик. */
  const hint = $derived(
    error
      ? error
      : busy
        ? 'Поиск…'
        : state.total === 0 && query.trim()
          ? 'Не найдено'
          : state.truncated
            ? `Найдено больше ${state.total} — показаны первые`
            : '',
  );
</script>

<div
  class="absolute right-2 top-2 z-[var(--layer-popup)] flex w-[min(24rem,calc(100%-1rem))] flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--overlay-surface)] p-1.5 shadow-overlay"
  data-testid="reader-search"
  role="search"
  aria-label="Поиск по книге"
>
  <!--
    Поле занимает всё доступное место строки до кнопок: справа от него пустого
    места нет. Класс ширины у `Input` без иконки применяется к самому полю,
    поэтому растягивается обёртка.
  -->
  <div class="flex items-center gap-1">
    <div class="min-w-0 flex-1">
      <Input
        value={query}
        placeholder="Поиск по книге"
        ariaLabel="Поиск по книге"
        class="h-8"
        oninput={(event) => onQuery?.(event.currentTarget.value)}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            onStep?.(event.shiftKey ? -1 : 1);
          } else if (event.key === 'Escape') {
            onClose?.();
          }
        }}
      />
    </div>
    <span
      class="inline-block min-w-[3.5rem] shrink-0 text-right text-xs [font-variant-numeric:tabular-nums] text-[var(--muted-foreground)]"
      data-testid="reader-search-counter"
      >{counter}</span
    >
    <Button
      variant="ghost"
      size="icon"
      title="Предыдущее вхождение"
      ariaLabel="Предыдущее вхождение"
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
      title="Следующее вхождение"
      ariaLabel="Следующее вхождение"
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
      title="Закрыть поиск"
      ariaLabel="Закрыть поиск"
      class="size-8"
      onclick={() => onClose?.()}
    >
      <Icon name="close" />
    </Button>
  </div>
  {#if hint}
    <p class="m-0 px-1 text-xs text-[var(--muted-foreground)]" data-testid="reader-search-hint">
      {hint}
    </p>
  {/if}
</div>
