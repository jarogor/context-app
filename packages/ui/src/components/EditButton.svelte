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
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    onclick,
    title = 'Переименовать',
    ariaLabel,
    size = 'icon',
    class: className = '',
  }: Props = $props();
</script>

<Button variant="secondary" {size} {title} ariaLabel={ariaLabel ?? title} {onclick} class={className}>
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
    />
  </svg>
</Button>
