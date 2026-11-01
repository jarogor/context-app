<script lang="ts">
  import { t } from '@context/i18n';
  import { untrack } from 'svelte';
  import { Button, ColorPicker, Textarea, type ColorSwatch } from '@context/ui';
  import {
    DEFAULT_NOTE_COLOR,
    NOTE_COLORS,
    noteColorLabel,
    NOTE_COLOR_SWATCHES,
    type NoteColor,
  } from '../notes/notes';

  interface Props {
    /** Начальный текст заметки: пуст при создании, задан при правке. */
    initialText?: string;
    /** Начальный цвет заметки: цвет создания или цвет правимой заметки. */
    initialColor?: NoteColor;
    /** Подтверждение текста и цвета заметки (текст непустой). */
    onConfirm: (text: string, color: NoteColor) => void;
    /** Отмена создания или правки заметки. */
    onCancel: () => void;
  }

  let {
    initialText = '',
    initialColor = DEFAULT_NOTE_COLOR,
    onConfirm,
    onCancel,
  }: Props = $props();

  /** Черновик текста заметки. */
  let draft = $state(untrack(() => initialText));

  /** Черновик цвета заметки. */
  let color = $state<NoteColor>(untrack(() => initialColor));

  /** Образцы выбора цвета заметки в окне. */
  const colorSwatches = $derived<ColorSwatch[]>(
    NOTE_COLORS.map((value) => ({
      id: value,
      label: noteColorLabel(value),
      value: NOTE_COLOR_SWATCHES[value],
      selected: color === value,
    })),
  );

  /** Подтверждение: пустой текст отклоняется. */
  function confirm() {
    const text = draft.trim();
    if (text) {
      onConfirm(text, color);
    }
  }
</script>

<div
  class="absolute inset-x-0 bottom-4 z-[var(--layer-popup)] mx-auto w-[26.25rem] max-w-[90%] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--overlay-surface)] p-3 shadow-overlay"
  data-testid="text-card-editor"
>
  <Textarea
    bind:value={draft}
    placeholder={t('app.reader.note.editor.placeholder')}
    ariaLabel={t('app.reader.note.editor.placeholder')}
    rows={3}
  />
  <div class="mt-2 flex items-center justify-between gap-2">
    <ColorPicker
      colors={colorSwatches}
      onpick={(id) => (color = id as NoteColor)}
      ariaLabel={t('app.reader.note.editor.colorLabel')}
      testIdPrefix="text-card-color"
    />
    <div class="flex items-center gap-2">
      <Button variant="secondary" size="sm" onclick={onCancel}>{t('app.reader.cancel')}</Button>
      <Button variant="primary" size="sm" disabled={!draft.trim()} onclick={confirm}
      >{t('app.action.save')}</Button
    >
    </div>
  </div>
</div>
