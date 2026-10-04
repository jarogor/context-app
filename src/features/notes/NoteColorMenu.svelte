<script lang="ts">
  import { NOTE_COLORS, NOTE_COLOR_LABELS, NOTE_COLOR_SWATCHES, type NoteColor } from './notes';

  interface Props {
    /** Выбор цвета подсветки заметки. */
    onpick: (color: NoteColor) => void;
    /** Тексты подсказок цветов (для доступности и тестов). */
    labelPrefix?: string;
  }

  let { onpick, labelPrefix = 'Создать заметку' }: Props = $props();
</script>

<div class="flex items-center gap-1" data-testid="note-color-menu">
  {#each NOTE_COLORS as color (color)}
    <button
      type="button"
      class="h-6 w-6 cursor-pointer rounded-full border border-[var(--border)] transition-transform hover:scale-110"
      style="background: {NOTE_COLOR_SWATCHES[color]}"
      title="{labelPrefix}: {NOTE_COLOR_LABELS[color]}"
      aria-label="{labelPrefix}: {NOTE_COLOR_LABELS[color]}"
      data-testid="note-color-{color}"
      onclick={() => onpick(color)}
    ></button>
  {/each}
</div>
