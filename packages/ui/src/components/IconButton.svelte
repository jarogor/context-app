<script lang="ts" module>
  /** Действие иконочной кнопки; определяет иконку, вариант и подпись по умолчанию. */
  export type IconButtonAction = 'add' | 'delete' | 'edit';
</script>

<script lang="ts">
  import Button from './Button.svelte';
  import Icon, { type IconName } from './Icon.svelte';

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

  /** Параметры действия: вариант кнопки, подпись и имя иконки. */
  const ACTIONS: Record<
    IconButtonAction,
    { variant: 'primary' | 'secondary' | 'ghost-danger'; title: string; icon: IconName }
  > = {
    add: { variant: 'primary', title: 'Добавить', icon: 'plus' },
    delete: { variant: 'ghost-danger', title: 'Удалить', icon: 'trash' },
    edit: { variant: 'secondary', title: 'Изменить', icon: 'pencil' },
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
  <Icon name={spec.icon} />
</Button>
