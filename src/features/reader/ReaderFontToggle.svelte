<script lang="ts">
  import { Button } from '@context/ui';
  import { t } from '@context/i18n';

  /** Переключатель гарнитуры книги в правом верхнем углу области чтения.
   *
   * Стоит на том же месте, что и меню инструмента заметок: у текучей книги
   * доступна только цитата, выбирать тип нечего, и вместо меню — переключение
   * шрифта.
   */

  interface Props {
    /** Текущая гарнитура книги. */
    readerFont: 'serif' | 'sans';
    /** Переключение гарнитуры книги. */
    onToggle: () => void;
  }

  let { readerFont, onToggle }: Props = $props();

  /** Подпись кнопки называет шрифт, на который она переключает. */
  const title = $derived(
    readerFont === 'serif' ? t('app.font.switchToSans') : t('app.font.switchToSerif'),
  );
</script>

<div class="absolute right-2 top-2 z-[calc(var(--layer-panel)-1)]" data-testid="note-tool">
  <Button
    variant="secondary"
    size="icon"
    title={title}
    ariaLabel={title}
    testId="reader-font-toggle"
    onclick={onToggle}
  >
    <span
      class="text-base leading-none"
      style="font-family: {readerFont === 'serif'
        ?"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        :"Georgia, 'Times New Roman', serif"}"
      aria-hidden="true">Аа</span
    >
  </Button>
</div>
