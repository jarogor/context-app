<script lang="ts">
  import { t } from '@context/i18n';
  import { cn } from '../utils';
  import Icon from './Icon.svelte';

  /**
   * Поле поиска со счётчиком найденного внутри.
   *
   * Иконка-лупа и счётчик — части одного поля, а не соседние элементы: счётчик
   * показывает, сколько нашлось по введённому запросу, поэтому стоит в том же
   * поле справа, где и иконка слева. Рамка, фон и высота совпадают с остальными
   * полями полосы (`h-9`, на грубом указателе `h-11`).
   *
   * Поле собирается оболочкой контейнера, а не обводкой `input`: текст, счётчик
   * и кнопка очистки — части одного контрола, и их расположение не зависит от
   * ширины числа в счётчике.
   */
  interface Props {
    /** Строка запроса (двусторонняя привязка). */
    value?: string;
    /** Плейсхолдер. */
    placeholder?: string;
    /** Доступное имя поля. */
    ariaLabel?: string;
    /** Сколько записей показано по запросу. */
    shown?: number;
    /** Сколько записей всего. */
    total?: number;
    /** Показывать ли счётчик; по умолчанию — когда переданы числа. */
    showCounter?: boolean;
    /** Метка счётчика для тестов. */
    counterTestId?: string;
    /** Показывать ли кнопку очистки, когда поле не пусто. */
    clearable?: boolean;
    /** Недоступность. */
    disabled?: boolean;
    /** Ссылка на сам элемент поля (для фокуса). */
    element?: HTMLInputElement;
    /** Обработчик ввода. */
    oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
    /** Обработчик нажатия клавиши. */
    onkeydown?: (event: KeyboardEvent) => void;
    /** Дополнительные классы контейнера. */
    class?: string;
  }

  let {
    value = $bindable(''),
    placeholder = '',
    ariaLabel = '',
    shown,
    total,
    showCounter = shown !== undefined && total !== undefined,
    counterTestId,
    clearable = false,
    disabled = false,
    element = $bindable(),
    oninput,
    onkeydown,
    class: className = '',
  }: Props = $props();

  /** Текст счётчика: сколько найдено из скольких всего. */
  const counterLabel = $derived(
    shown !== undefined && total !== undefined ? t('app.search.filter', { shown, total }) : '',
  );

  /** Очистка поля и уведомление об изменении. */
  function clear() {
    value = '';
    oninput?.({ currentTarget: { value: '' } } as unknown as Event & {
      currentTarget: HTMLInputElement;
    });
  }
</script>

<div
  class={cn(
    'border-[var(--input)] bg-card focus-within:border-ring focus-within:ring-ring/35 box-border flex h-9 w-full min-w-0 items-center gap-2 rounded-[var(--radius)] border px-2.5 transition-[color,box-shadow,border-color] focus-within:ring-[3px] pointer-coarse:min-h-11',
    disabled && 'cursor-not-allowed opacity-50',
    className,
  )}
  data-search-field
>
  <Icon name="search" class="text-muted-foreground h-4 w-4 shrink-0" />
  <input
    bind:this={element}
    type="text"
    {placeholder}
    {disabled}
    aria-label={ariaLabel}
    bind:value
    {oninput}
    {onkeydown}
    class="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 border-0 bg-transparent py-1 text-sm outline-none pointer-coarse:text-base"
  />
  {#if showCounter && counterLabel}
    <span
      class="role-caption shrink-0 whitespace-nowrap text-[var(--muted-foreground)] tabular-nums"
      data-testid={counterTestId}
    >
      {counterLabel}
    </span>
  {/if}
  {#if clearable && value}
    <button
      type="button"
      aria-label={t('app.search.clear')}
      title={t('app.search.clearTitle')}
      class="text-muted-foreground hover:text-foreground flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] hover:bg-[var(--surface-hover)]"
      onclick={clear}
    >
      <Icon name="close" class="h-3.5 w-3.5" />
    </button>
  {/if}
</div>
