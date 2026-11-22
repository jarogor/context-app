<script lang="ts">
  import { t } from '@context/i18n';
  import { Button, Icon, Input, PathField } from '@context/ui';
  import { hotkeyHint } from '../hotkeys/registry';

  /**
   * Строка книги — управление чтением под текстом.
   *
   * Строка стоит под панелями и книгой во всю ширину рабочего места, поэтому
   * открытие панели не меняет её места и не сдвигает кнопки из-под курсора.
   *
   * Порядок — по тому, как читают: слева меню и действия над текстом (поиск,
   * инструмент заметки, шрифт), справа — управление положением и видом книги
   * (страницы или прогресс, масштаб, тема). Ближе к правому краю то, что
   * меняют реже.
   */

  interface Props {
    /** Поддерживает ли формат страницы. */
    pages?: boolean;
    /** Текущая страница или `null`. */
    page?: number | null;
    /** Общее число страниц или `null`. */
    pageCount?: number | null;
    /** Прогресс чтения в процентах (у страничных не показывается). */
    progress?: number;
    /** Текущий масштаб в процентах. */
    zoom?: number;
    /** Нижняя граница масштаба. */
    minZoom?: number;
    /** Верхняя граница масштаба. */
    maxZoom?: number;
    /** Поддерживает ли формат изменение масштаба. */
    showZoom?: boolean;
    /** Путь к файлу книги: стоит в начале строки вместо действий. */
    path?: string;
    /** Формат книги: его короткая метка стоит перед путём. */
    format?: string;
    /** Текущая тема области чтения. */
    readerTheme?: 'light' | 'dark';
    /** Переключение темы области чтения. */
    onToggleTheme?: () => void;
    /** Переход к соседней странице. */
    onStepPage?: (delta: number) => void;
    /** Переход к введённому номеру страницы. */
    onGoToPage?: (page: number) => void;
    /** Изменение масштаба на шаг шкалы. */
    onStepZoom?: (direction: 1 | -1) => void;
  }

  let {
    pages = false,
    page = null,
    pageCount = null,
    progress = 0,
    zoom = 100,
    minZoom = 60,
    maxZoom = 220,
    showZoom = true,
    path = '',
    format = '',
    readerTheme = 'light',
    onToggleTheme,
    onStepPage,
    onGoToPage,
    onStepZoom,
  }: Props = $props();

  /** Черновик поля номера страницы; `null` — поле показывает текущую страницу. */
  let pageDraft = $state<string | null>(null);

  /** Видимое значение поля страницы. */
  const pageValue = $derived(pageDraft ?? (page === null ? '' : String(page)));

  /** Элемент поля номера страницы. */
  let pageInput: HTMLInputElement | undefined = $state();

  /**
   * Выделение номера целиком при входе в поле.
   *
   * Действие браузера по `mousedown` ставит каретку и снимает выделение уже
   * после обработчиков `focus`/`mouseup` — поэтому клик, который забирает фокус,
   * отменяется, и фокус с выделением ставятся сами. Повторный клик внутри уже
   * активного поля не перехватывается: там каретка нужна как обычно.
   */
  $effect(() => {
    const field = pageInput;
    if (!field) {
      return;
    }
    const onFocus = () => field.select();
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || document.activeElement === field) {
        return;
      }
      event.preventDefault();
      field.focus();
      field.select();
    };
    field.addEventListener('focus', onFocus);
    field.addEventListener('mousedown', onMouseDown);
    return () => {
      field.removeEventListener('focus', onFocus);
      field.removeEventListener('mousedown', onMouseDown);
    };
  });

  /**
   * Ширина поля номера по разрядности: под число страниц и текущую страницу.
   *
   * Фиксированной ширины нет — «9» не должно занимать место «999». Минимум в
   * два знака и внутренние отступы оставляют поле похожим на поле, а не на
   * цифру в строке.
   */
  const pageInputWidth = $derived(
    `calc(${Math.max(2, String(pageCount ?? 0).length, String(page ?? 0).length)}ch + 0.75rem)`,
  );

  /** Переход к введённому номеру страницы. */
  function commitPage() {
    const draft = pageDraft?.trim();
    if (draft !== undefined && draft !== '') {
      const value = Number(draft);
      if (Number.isInteger(value) && value >= 1) {
        onGoToPage?.(value);
      }
    }
    pageDraft = null;
  }

  /** Подпись кнопки темы: называет сторону, на которую она переключит. */
  const themeTitle = $derived(
    readerTheme === 'dark' ? t('app.theme.reader.toLight') : t('app.theme.reader.toDark'),
  );

  /** Доступное имя кнопки темы: называет текущую сторону, как у значка. */
  const themeLabel = $derived(
    readerTheme === 'dark' ? t('app.theme.reader.light') : t('app.theme.reader.dark'),
  );
</script>

<div
  class="flex h-[var(--book-bar-height)] flex-none flex-nowrap items-center gap-1 overflow-hidden bg-[var(--card)] px-1.5 text-sm [font-variant-numeric:tabular-nums] large-tablet:gap-1.5 large-tablet:px-2"
  data-testid="book-bar"
  role="toolbar"
  aria-label={t('app.bookBar.label')}
>
  <!--
    Слева — формат и путь к открытому файлу: та же врезка с копированием, что на
    странице книги в библиотеке. Блок занимает ширину своего содержимого, а не
    всю строку: короткий адрес не растягивается на пустую полосу. `max-w-full`
    не даёт длинному пути вытолкнуть навигацию справа.
  -->
  <PathField
    value={path}
    badge={format ? format.toUpperCase() : ''}
    class="mr-auto max-w-full"
    testId="book-bar-path"
  />

  <!--
    Справа — положение и вид книги: страницы или прогресс, масштаб, тема.
    Прогресс текучей книги стоит там же, где у страничной номер страницы:
    это одно и то же место «где я», просто у текучей книги его нечем считать
    по страницам.
  -->
  {#if pages && page !== null}
    <div
      class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
      data-testid="reader-pages"
    >
      <Button
        size="icon"
        variant="ghost"
        title={t('app.reader.prevPage')}
        ariaLabel={t('app.reader.prevPage')}
        class="size-8"
        disabled={page <= 1}
        onclick={() => onStepPage?.(-1)}
      >
        <Icon name="chevron-up" />
      </Button>
      <!--
        Текущая страница — поле ввода, но в покое оно не выделяется цветом: иначе
        строка выглядит пёстрой. Поле обнаруживается при наведении: подложка и
        курсор-указатель показывают, что сюда можно ткнуть, а внутри поля курсор
        снова текстовый. По клику число выделяется целиком — иначе его пришлось бы
        стирать перед вводом нового. Ширина — по разрядности номера, а не
        фиксированная: «9» не занимает место «999».
      -->
      <Input
        bind:element={pageInput}
        class="h-8 cursor-pointer bg-transparent px-1.5 py-0 text-right text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] focus:cursor-text focus-visible:bg-[var(--surface-hover)]"
        ariaLabel={t('app.reader.currentPage')}
        value={pageValue}
        style="width: {pageInputWidth}"
        oninput={(event) => (pageDraft = event.currentTarget.value)}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            commitPage();
          }
          if (event.key === 'Escape') {
            // Отмена возвращает текущую страницу и уводит курсор из поля: ввод
            // начат по ошибке, и держать фокус в нём незачем.
            event.preventDefault();
            pageDraft = null;
            pageInput?.blur();
          }
        }}
        onblur={commitPage}
      />
      <span
        class="inline-block shrink-0 whitespace-nowrap text-left text-sm text-[var(--muted-foreground)]"
        data-testid="reader-page-count"
        >/ {pageCount ?? '?'}</span
      >
      <Button
        size="icon"
        variant="ghost"
        title={t('app.reader.nextPage')}
        ariaLabel={t('app.reader.nextPage')}
        class="size-8"
        disabled={pageCount !== null && page >= pageCount}
        onclick={() => onStepPage?.(1)}
      >
        <Icon name="chevron-down" />
      </Button>
    </div>
  {:else}
    <!--
      Прогресс показывается у книг без страниц, в том числе пока формат ещё не
      сообщил свои возможности: это место «где я», и пустым оно быть не должно.
    -->
    <span
      class="inline-block shrink-0 text-right whitespace-nowrap text-sm text-[var(--muted-foreground)]"
      data-testid="reader-progress"
      >{Math.round(progress)}%</span
    >
  {/if}

  {#if showZoom}
    <div
      class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
      data-testid="reader-zoom-group"
    >
      <!--
        Кнопки стоят по бокам индикатора, как у страничной навигации: одно
        правило на оба компонента, «меньше» слева, «больше» справа.
      -->
      <Button
        size="icon"
        variant="ghost"
        title={hotkeyHint('reader.zoom.out', t('app.reader.zoomOut'))}
        ariaLabel={t('app.reader.zoomOut')}
        class="size-8"
        disabled={zoom <= minZoom}
        onclick={() => onStepZoom?.(-1)}>−</Button
      >
      <span class="min-w-9 px-1 text-center text-sm" data-testid="reader-zoom">{zoom}%</span>
      <Button
        size="icon"
        variant="ghost"
        title={hotkeyHint('reader.zoom.in', t('app.reader.zoomIn'))}
        ariaLabel={t('app.reader.zoomIn')}
        class="size-8"
        disabled={zoom >= maxZoom}
        onclick={() => onStepZoom?.(1)}>+</Button
      >
    </div>
  {/if}

  {#if onToggleTheme}
    <Button
      size="icon"
      variant="ghost"
      title={themeTitle}
      ariaLabel={themeLabel}
      testId="reader-theme-toggle"
      onclick={onToggleTheme}
    >
      <Icon name={readerTheme === 'dark' ? 'sun' : 'moon'} />
    </Button>
  {/if}</div>
