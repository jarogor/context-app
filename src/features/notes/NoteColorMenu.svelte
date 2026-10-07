<script lang="ts">
  import { ColorPicker, type ColorSwatch } from '@texture/ui';
  import { NOTE_COLORS, NOTE_COLOR_LABELS, NOTE_COLOR_SWATCHES, type NoteColor } from './notes';

  interface Props {
    /** Выбор цвета подсветки заметки. */
    onpick: (color: NoteColor) => void;
    /** Тексты подсказок цветов (для доступности и тестов). */
    labelPrefix?: string;
  }

  let { onpick, labelPrefix = 'Создать заметку' }: Props = $props();

  /** Образцы палитры с подписями выбранного контекста. */
  const swatches = $derived<ColorSwatch[]>(
    NOTE_COLORS.map((color) => ({
      id: color,
      label: NOTE_COLOR_LABELS[color],
      value: NOTE_COLOR_SWATCHES[color],
    })),
  );
</script>

<ColorPicker
  colors={swatches}
  onpick={(id) => onpick(id as NoteColor)}
  ariaLabel={labelPrefix}
  testIdPrefix="note-color"
/>
