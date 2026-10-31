<script lang="ts" module>
  import type { IconName } from './Icon.svelte';
</script>

<script lang="ts">
  import Icon from './Icon.svelte';
  import { cn } from '../utils';

  interface Props {
    /** Текущее значение. */
    value?: string;
    /** Тип поля. */
    type?: string;
    /** Плейсхолдер. */
    placeholder?: string;
    /** Доступное имя поля (aria-label). */
    ariaLabel?: string;
    /** Идентификатор для label. */
    id?: string;
    /** Иконка внутри поля слева. */
    icon?: IconName;
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
    /** Дополнительные инлайновые стили (например, ширина по разрядности). */
    style?: string;
    /** Показывать ли кнопку очистки, когда поле не пусто. */
    clearable?: boolean;
    /** Ссылка на сам элемент поля (для фокуса и выделения). */
    element?: HTMLInputElement;
    /** Обработчик ввода. */
    oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
    /** Обработчик нажатия клавиши. */
    onkeydown?: (event: KeyboardEvent) => void;
    /** Обработчик потери фокуса. */
    onblur?: () => void;
  }

  let {
    value = $bindable(''),
    type = 'text',
    placeholder = '',
    ariaLabel,
    id,
    icon,
    disabled = false,
    class: className = '',
    style,
    clearable = false,
    element = $bindable(),
    oninput,
    onkeydown,
    onblur,
  }: Props = $props();

  /** Очистка поля и уведомление об изменении. */
  function clear() {
    value = '';
    oninput?.({ currentTarget: { value: '' } } as unknown as Event & {
      currentTarget: HTMLInputElement;
    });
  }

  /** Базовые стили поля, общие для варианта с иконкой и без.
   *
   * На указателе-пальце поле поднимается до сенсорной цели и получает базовый
   * кегль 16px: так палец попадает в поле, а мобильный webview не приближает
   * страницу при фокусе (автозум срабатывает на кегле меньше 16px). */
  const fieldClass =
    'border-[var(--input)] bg-card placeholder:text-muted-foreground hover:border-[var(--border)] focus-visible:border-ring focus-visible:ring-ring/35 aria-invalid:border-destructive box-border h-9 w-full min-w-0 rounded-[var(--radius)] border text-sm transition-[color,box-shadow,border-color] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:text-base';
</script>

{#if icon}
  <div class={cn('relative', className)}>
    <Icon
      name={icon}
      class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
    />
    <input
      bind:this={element}
      {id}
      {type}
      {placeholder}
      {disabled}
      aria-label={ariaLabel}
      bind:value
      {oninput}
      {onkeydown}
      {onblur}
      class={cn(fieldClass, 'py-1', clearable && value ? 'pr-9 pl-8' : 'pr-3 pl-8')}
      {style}
    />
    {#if clearable && value}
      <button
        type="button"
        aria-label="Очистить поиск"
        title="Очистить"
        class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[var(--radius)] hover:bg-[var(--surface-hover)]"
        onclick={clear}
      >
        <Icon name="close" class="h-3.5 w-3.5" />
      </button>
    {/if}
  </div>
{:else}
  <div class="relative">
    <input
      bind:this={element}
      {id}
      {type}
      {placeholder}
      {disabled}
      aria-label={ariaLabel}
      bind:value
      {oninput}
      {onkeydown}
      {onblur}
      class={cn(fieldClass, 'px-3 py-1', className, clearable && value && 'pr-9')}
      {style}
    />
    {#if clearable && value}
      <button
        type="button"
        aria-label="Очистить поиск"
        title="Очистить"
        class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[var(--radius)] hover:bg-[var(--surface-hover)]"
        onclick={clear}
      >
        <Icon name="close" class="h-3.5 w-3.5" />
      </button>
    {/if}
  </div>
{/if}
