<script lang="ts">
  import { Button, Icon, readerOverlayTokens, type PaletteId, type ReaderThemeId } from '@context/ui';
  import { t } from '@context/i18n';

  /** Меню сноски книги, общее для областей текучего чтения.
   *
   * Рисуется оболочкой поверх области чтения, а не внутри документа книги: так
   * меню принадлежит приложению и не дублирует разметку в `srcdoc`. Оформление
   * берётся из темы области чтения (`readerOverlayTokens`), а не из темы
   * интерфейса: меню относится к книге и обязано менять сторону вместе с ней.
   * Длинная сноска ограничивается по высоте и прокручивается.
   */

  interface Props {
    /** HTML содержимого сноски в разметке книги. */
    html: string;
    /** Положение маркера сноски в координатах области чтения (пиксели). */
    at: { left: number; top: number; bottom: number };
    /** Размеры области чтения для удержания меню внутри неё. */
    area: { width: number; height: number };
    /** Палитра оформления: общий реестр дизайн-системы. */
    palette: PaletteId;
    /** Сторона темы области чтения. */
    readerTheme: ReaderThemeId;
    /** Переход к сноске в книге. */
    onGoto: () => void;
    /** Закрытие меню. */
    onClose: () => void;
  }

  let { html, at, area, palette, readerTheme, onGoto, onClose }: Props = $props();

  /** Оценочные размеры меню для удержания внутри области чтения. */
  const MENU_WIDTH = 320;
  const MENU_HEIGHT = 220;

  /** Токены слоя по теме области чтения. */
  const tones = $derived(readerOverlayTokens(palette, readerTheme));

  /** Кнопки меню — те же компоненты системы, но на токенах чтения.
   *
   * Значения темы области чтения приходят данными, поэтому передаются кнопкам
   * переменными: классы системы снимают собственные цвета и берут эти.
   */
  const actionClass = $derived(
    [
      'border-[var(--fn-border)] bg-transparent text-[var(--fn-text)]',
      'hover:bg-[var(--fn-hover)] hover:text-[var(--fn-text)]',
    ].join(' '),
  );

  /** Стиль позиции и цвета: под маркером, при нехватке места — над ним. */
  const style = $derived.by(() => {
    const x = Math.max(8, Math.min(at.left, Math.max(8, area.width - MENU_WIDTH - 8)));
    const below = at.bottom + 6;
    const y =
      area.height > 0 && below + MENU_HEIGHT > area.height
        ? Math.max(8, at.top - MENU_HEIGHT - 6)
        : below;
    return [
      `left: ${x}px`,
      `top: ${y}px`,
      `width: ${MENU_WIDTH}px`,
      `background: ${tones.surface}`,
      `color: ${tones.text}`,
      `border-color: ${tones.border}`,
      `--fn-text: ${tones.text}`,
      `--fn-border: ${tones.border}`,
      `--fn-hover: ${tones.hover}`,
    ].join('; ');
  });
</script>

<div
  class="absolute z-[var(--layer-popup)] flex flex-col gap-1 rounded-[var(--radius)] border p-1 shadow-overlay"
  data-testid="footnote-menu"
  data-reader-theme={readerTheme}
  style={style}
>
  <!-- Содержимое сноски приходит из документа книги уже очищенным: без
       скриптов, обработчиков и внешних ресурсов (см. `footnote.ts`). -->
  <div
    class="max-h-[16rem] overflow-y-auto px-2 py-1 text-sm leading-relaxed [&_a]:pointer-events-none [&_img]:max-w-full [&_img]:h-auto [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
    data-testid="footnote-text"
  >
    {@html html}
  </div>
  <div class="flex items-center justify-end gap-1">
    <Button
      variant="secondary"
      size="icon"
      class={actionClass}
      title={t('app.reader.footnote.goto')}
      ariaLabel={t('app.reader.footnote.goto')}
      testId="footnote-goto"
      onclick={onGoto}
    >
      <Icon name="chevron-down" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class={actionClass}
      title={t('app.modal.close')}
      ariaLabel={t('app.modal.close')}
      onclick={onClose}
    >
      <Icon name="close" />
    </Button>
  </div>
</div>
