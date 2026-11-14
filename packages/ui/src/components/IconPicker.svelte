<script lang="ts" module>
  /** Иконка в единой палитре выбора иконок. */
  export interface IconSwatch {
    /** Идентификатор иконки, передаваемый в обработчик выбора. */
    id: string;
    /** Подпись иконки для доступности и подсказки. */
    label: string;
    /** Выбрана ли иконка в данный момент. */
    selected?: boolean;
  }
</script>

<script lang="ts">
  import { cn } from '../utils';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    /** Образцы палитры иконок. */
    icons: IconSwatch[];
    /** Обработчик выбора иконки. */
    onpick: (id: string) => void;
    /** Метка доступности группы иконок. */
    ariaLabel?: string;
    /** Префикс идентификаторов для проверок. */
    testIdPrefix?: string;
    /** Дополнительные классы контейнера. */
    class?: string;
  }

  import { t } from '@context/i18n';

  let {
    icons,
    onpick,
    ariaLabel,
    testIdPrefix = 'icon',
    class: className = '',
  }: Props = $props();
</script>

<!--
  Палитра иконок — сетка кнопок-иконок, как палитра цветов: та же роль в выборе
  оформления, только вместо цвета образец — иконка. Выбранная и иконка под
  курсором подсвечиваются фоном; сетка переносится по ширине, потому что иконок
  больше и в одну строку они были бы мелкими. Собственной рамки у сетки нет: она
  стоит внутри меню и всплывающего слоя, и лишний контур спорил бы с их обводкой.
-->
<div
  class={cn(
    'flex max-w-[11.25rem] flex-wrap items-center gap-1 rounded-md bg-[var(--card)] p-1',
    className,
  )}
  role="group"
  aria-label={ariaLabel ?? t('app.icon.label')}
  data-testid={`${testIdPrefix}-picker`}
>
  {#each icons as item (item.id)}
    <button
      type="button"
      class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[0.25rem] text-[var(--muted-foreground)] transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none {item.selected
        ? 'bg-[var(--surface-selected)] text-[var(--foreground)]'
        : 'hover:bg-[var(--surface-hover)]'}"
      title={item.label}
      aria-label={item.label}
      aria-pressed={item.selected ? 'true' : 'false'}
      data-testid="{testIdPrefix}-{item.id}"
      onclick={() => onpick(item.id)}
    >
      <Icon name={item.id as IconName} class="h-4 w-4" />
    </button>
  {/each}
</div>
