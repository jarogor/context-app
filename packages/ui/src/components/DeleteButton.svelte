<script lang="ts">
  import Button from './Button.svelte';

  interface Props {
    /** Обработчик нажатия. */
    onclick?: (event: MouseEvent) => void;
    /** Подпись-подсказка. */
    title?: string;
    /** Метка доступности; по умолчанию — из подсказки. */
    ariaLabel?: string;
    /** Размер кнопки. */
    size?: 'md' | 'sm' | 'icon';
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    onclick,
    title = 'Удалить',
    ariaLabel,
    size = 'icon',
    disabled = false,
    class: className = '',
  }: Props = $props();
</script>

<Button
  variant="ghost-danger"
  {size}
  {title}
  ariaLabel={ariaLabel ?? title}
  {disabled}
  {onclick}
  class={className}
>
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</Button>
