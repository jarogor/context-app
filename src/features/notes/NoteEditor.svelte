<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button, Icon, IconButton, Input, Textarea } from '@texture/ui';

  interface Props {
    /** Идентификатор редактируемой заметки. */
    noteId: string;
    /** Начальное название заметки. */
    initialTitle: string;
    /** Начальный комментарий заметки. */
    initialComment: string;
    /** Сохранение названия и комментария заметки. */
    onCommit: (noteId: string, details: { title: string; comment: string }) => void;
    /** Завершение правки без сохранения. */
    onCancel: () => void;
  }

  let { noteId, initialTitle, initialComment, onCommit, onCancel }: Props = $props();

  /** Черновик названия заметки. */
  let title = $state(untrack(() => initialTitle));

  /** Черновик комментария заметки. */
  let comment = $state(untrack(() => initialComment));

  /** Сохранение изменённого названия и комментария. */
  function commit() {
    onCommit(noteId, { title, comment });
  }

  /** Удаление комментария: поле очищается, название остаётся. */
  function clearComment() {
    comment = '';
  }

  onMount(() => {
    // Форма раскрывается у нижнего края списка: после появления её прокручивают в
    // поле зрения, иначе при малой высоте окна кнопки оказывались ниже края панели.
    const editor = document.querySelector('[data-testid="notes-item-editor"]');
    if (editor && typeof editor.scrollIntoView === 'function') {
      editor.scrollIntoView({ block: 'end' });
    }
  });
</script>

<div
  class="mt-2 flex flex-col gap-2 border-t border-[var(--border)] pt-2"
  data-testid="notes-item-editor"
>
  <Input bind:value={title} placeholder="Название" ariaLabel="Название заметки" />
  <Textarea
    bind:value={comment}
    placeholder="Комментарий"
    ariaLabel="Комментарий заметки"
    rows={3}
  />
  <div class="flex items-center justify-between gap-2">
    <!-- Удаление комментария — отдельно слева, чтобы не задеть сохранение/отмену. -->
    <IconButton
      action="delete"
      title="Удалить комментарий"
      ariaLabel="Удалить комментарий"
      disabled={!comment}
      onclick={clearComment}
    />
    <div class="flex items-center gap-2">
      <Button
        variant="secondary"
        size="icon"
        title="Отмена"
        ariaLabel="Отмена"
        onclick={onCancel}
      >
        <Icon name="close" />
      </Button>
      <Button
        variant="primary"
        size="icon"
        title="Сохранить"
        ariaLabel="Сохранить"
        onclick={commit}
      >
        <Icon name="check" />
      </Button>
    </div>
  </div>
</div>
