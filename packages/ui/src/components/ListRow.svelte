<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';
  import RowActions from './RowActions.svelte';

  interface Props {
    /** Обработчик клика по пункту; без него пункт не интерактивен. */
    onclick?: (event: MouseEvent) => void;
    /** Пункт отмечен как текущий/выбранный. */
    selected?: boolean;
    /** Состояние раскрытия (для раскрываемых пунктов). */
    expanded?: boolean;
    /** Пункт недоступен. */
    disabled?: boolean;
    /** Метка доступности интерактивного пункта. */
    ariaLabel?: string;
    /** Подпись-подсказка. */
    title?: string;
    /** Метка для тестов. */
    testId?: string;
    /** Метка для тестов у кликабельной области (кнопки). */
    buttonTestId?: string;
    /** Название пункта (акцентная строка). */
    titleContent: Snippet;
    /** Содержимое в конце строки названия, перед действиями (например, счётчик). */
    trailing?: Snippet;
    /** Метаинформация под названием. */
    meta?: Snippet;
    /** Действия пункта (контекстное меню); показываются в конце строки. */
    actions?: Snippet;
    /**
     * Фрагмент inline-стиля строки.
     *
     * Нужен для пользовательского оформления пункта (например, заливки цветом):
     * переменные `--row-fill` и `--row-fill-selected` задают фон обычной и
     * выбранной строки, не отменяя наведение и подсветку выбора.
     */
    style?: string;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    onclick,
    selected = false,
    expanded,
    disabled = false,
    ariaLabel,
    title,
    testId,
    buttonTestId,
    titleContent,
    trailing,
    meta,
    actions,
    style = '',
    class: className = '',
  }: Props = $props();

  /**
   * Вид строки — лист списка: без рамки у каждой строки. Строки отделяются
   * тонкой линией-разделителем (последняя — без неё), а наведение и выбор
   * подсвечивают **всю строку целиком** фоном. Так список читается единым
   * листом, а не набором рамок, и при этом строки не сливаются с фоном.
   *
   * Фон берётся из переменной `--row-fill`: оформление пункта (например, цвет)
   * задаёт её необязательным стилем, а без оформления остаётся фон карточки.
   * Своего контура строка не рисует: у списка уже есть обводка, и второй контур
   * рядом с ней читался бы двойной рамкой.
   */
  const box = $derived(
    cn(
      'transition-colors',
      selected
        ? 'bg-[var(--row-fill-selected,var(--surface-selected))]'
        : onclick && !disabled
          ? 'bg-[var(--row-fill,var(--card))] hover:bg-[color-mix(in_oklab,var(--primary)_8%,var(--row-fill,var(--card)))]'
          : 'bg-[var(--row-fill,var(--card))]',
    ),
  );
</script>

<div
  class={cn(box, 'flex items-stretch', className)}
  data-testid={testId}
  data-selected={selected ? 'true' : undefined}
  style={style || undefined}
>
  <button
    type="button"
    data-testid={buttonTestId}
    class={cn(
      'flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3 text-left [font:inherit]',
      onclick && !disabled ? 'cursor-pointer' : 'cursor-default',
      disabled ? 'cursor-not-allowed opacity-60' : '',
      // Фон наведения/выбора — на всей строке (`ListRow`), а не на внутренней
      // кнопке: иначе выделялась бы только часть пункта со скруглёнными краями.
    )}
    {disabled}
    aria-label={ariaLabel}
    {title}
    aria-current={selected ? 'true' : undefined}
    aria-expanded={expanded}
    {onclick}
  >
    <span class="flex min-w-0 items-center gap-2">
      {@render titleContent()}
      {#if trailing}
        <span class="ml-auto flex shrink-0 items-center gap-2">{@render trailing()}</span>
      {/if}
    </span>
    {#if meta}
      {@render meta()}
    {/if}
  </button>

  {#if actions}
    <RowActions class="p-2">
      {@render actions()}
    </RowActions>
  {/if}
</div>
