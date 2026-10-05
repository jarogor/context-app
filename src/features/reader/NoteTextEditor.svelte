<script lang="ts">
  import { Button, Textarea } from '@texture/ui';

  interface Props {
    /** Подтверждение текста заметки (непустой). */
    onConfirm: (text: string) => void;
    /** Отмена создания заметки. */
    onCancel: () => void;
  }

  let { onConfirm, onCancel }: Props = $props();

  /** Черновик текста заметки. */
  let draft = $state('');

  /** Подтверждение: пустой текст отклоняется. */
  function confirm() {
    const text = draft.trim();
    if (text) {
      onConfirm(text);
    }
  }
</script>

<div
  class="absolute inset-x-0 bottom-4 z-20 mx-auto w-[420px] max-w-[90%] rounded-md border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg"
  data-testid="text-card-editor"
>
  <Textarea
    bind:value={draft}
    placeholder="Текст заметки"
    ariaLabel="Текст заметки"
    rows={3}
  />
  <div class="mt-2 flex justify-end gap-2">
    <Button variant="secondary" size="sm" onclick={onCancel}>Отмена</Button>
    <Button variant="primary" size="sm" disabled={!draft.trim()} onclick={confirm}>Сохранить</Button>
  </div>
</div>
