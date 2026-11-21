<script lang="ts">
  import { t } from '@context/i18n';
  import logoMarkup from './context-logo.svg?raw';

  /**
   * Верхняя панель приложения — строка контекста.
   *
   * На десктопе несёт только контекст: где находится пользователь и что
   * выбрано (раздел или имя открытого рабочего места). Разделы, тема и
   * настройки живут в левом меню, поэтому шапка не повторяет навигацию.
   *
   * На телефоне меню нет — там шапка остаётся прежней: знак приложения, контекст
   * и нижняя навигация с разделами и служебными действиями.
   */
  interface Props {
    /** Название раздела: где находится пользователь. */
    section: string;
    /** Имя выбранного объекта раздела (рабочее место, библиотека), либо `null`. */
    selection: string | null;
    /** Узкое окно: шапка несёт знак приложения и подписи. */
    mobile: boolean;
  }

  let { section, selection, mobile }: Props = $props();

  /** Подсказка навигационного текста: полный путь к выбранному объекту. */
  const contextTitle = $derived(
    selection ? `${section}${t('app.context.separator')}${selection}` : section,
  );
</script>

<header
  class="flex min-h-[var(--app-bar-height)] flex-none items-center gap-2 bg-[var(--app-bar-surface)] px-3 tablet:min-h-14 tablet:gap-4 tablet:px-6"
  style="padding-top: var(--safe-top);"
  data-testid="app-bar"
>
  <!--
    Знак приложения — логотип из файла `context-logo.svg`. Знак стоит в шапке
    один, без подписи рядом: настоящее имя остаётся доступным именем элемента,
    его читают экранные дикторы, и оно попадает в подсказку.

    Логотип вставляется разметкой, а не картинкой: его контуры рисуются
    `currentColor` и берут цвет активной темы (`--primary`), поэтому знак
    согласован с выделением раздела и виден на светлой и тёмной стороне. Размер
    задан в `rem` (2.25rem) и остаётся меньше высоты шапки, поэтому знак
    заметный, но высоту шапки не меняет.
  -->
  {#if mobile}
    <span
      class="text-[var(--primary)] flex size-9 shrink-0 items-center justify-center [&>svg]:size-full"
      data-testid="app-name"
      role="img"
      aria-label={t('app.name')}
      title={t('app.name')}
    >
      {@html logoMarkup}
    </span>
  {/if}
  <!--
    Навигационный текст. На узком окне (телефон, планшет) остаётся только имя
    выбранного объекта: название раздела уже показано меню-иконками, и «Рабочее
    место · foo» занимало бы место без пользы. На широком окне показывается и
    раздел, и выбор — шапка остаётся единственным местом, где это видно.
  -->
  <span
    class="min-w-0 truncate role-caption text-[var(--muted-foreground)] max-tablet:ml-4"
    data-testid="app-context"
    title={contextTitle}
  >
    {#if mobile && selection}
      <span class="font-semibold">{selection}</span>
    {:else}
      {section}{#if selection}{t('app.context.separator')}<span class="font-semibold">{selection}</span>{/if}
    {/if}
  </span>


</header>
