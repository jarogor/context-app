<script lang="ts">
  import Button from './Button.svelte';

  interface Props {
    /** Обработчик нажатия. */
    onclick?: (event: MouseEvent) => void;
    /** Подпись-подсказка. */
    title?: string;
    /** Метка доступности; по умолчанию — из подсказки. */
    ariaLabel?: string;
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    onclick,
    title = 'Добавить',
    ariaLabel,
    disabled = false,
    class: className = '',
  }: Props = $props();
</script>

<Button
  variant="primary"
  size="icon"
  {disabled}
  {title}
  ariaLabel={ariaLabel ?? title}
  {onclick}
  class={className}
>
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M12 5v14M5 12h14"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
</Button>
