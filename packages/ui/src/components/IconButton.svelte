<script lang="ts" module>
  /** Действие иконочной кнопки; определяет иконку, вариант и подпись по умолчанию. */
  export type IconButtonAction = 'add' | 'delete' | 'edit';
</script>

<script lang="ts">
  import Button from './Button.svelte';

  interface Props {
    /** Действие кнопки; задаёт иконку, вариант оформления и подпись по умолчанию. */
    action: IconButtonAction;
    /** Обработчик нажатия. */
    onclick?: (event: MouseEvent) => void;
    /** Подпись-подсказка; по умолчанию — из действия. */
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

  /** Параметры действия: вариант кнопки, подпись и путь иконки. */
  const ACTIONS: Record<
    IconButtonAction,
    { variant: 'primary' | 'secondary' | 'ghost-danger'; title: string; path: string }
  > = {
    add: { variant: 'primary', title: 'Добавить', path: 'M12 5v14M5 12h14' },
    delete: {
      variant: 'ghost-danger',
      title: 'Удалить',
      path: 'M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13',
    },
    edit: {
      variant: 'secondary',
      title: 'Изменить',
      path: 'M4 20h4l10-10-4-4L4 16zM14 6l4 4',
    },
  };

  let {
    action,
    onclick,
    title,
    ariaLabel,
    size = 'icon',
    disabled = false,
    class: className = '',
  }: Props = $props();

  /** Параметры выбранного действия. */
  const spec = $derived(ACTIONS[action]);

  /** Итоговая подпись-подсказка. */
  const label = $derived(title ?? spec.title);
</script>

<Button
  variant={spec.variant}
  {size}
  title={label}
  ariaLabel={ariaLabel ?? label}
  {disabled}
  {onclick}
  class={className}
>
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d={spec.path}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</Button>
