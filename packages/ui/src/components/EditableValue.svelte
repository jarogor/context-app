<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '@context/i18n';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import Input from './Input.svelte';

  /**
   * Значение свойства с правкой по месту.
   *
   * Обычно показывается значение и значок правки; после нажатия на его месте
   * появляется поле с действиями «сохранить», «отменить» и «взять из файла».
   * Модальных окон нет: правится ровно то, что видно.
   */
  interface Props {
    /** Подпись свойства для доступности. */
    label: string;
    /** Текстовое значение, если своё отображение не задано. */
    value?: string;
    /** Своё отображение значения (ссылки, заголовок). */
    display?: Snippet;
    /** Идёт правка этого свойства. */
    editing: boolean;
    /** Черновик значения. */
    draft?: string;
    /** Есть правка, которую можно снять (взять значение из файла). */
    canClear: boolean;
    /** Начать правку. */
    onStart: () => void;
    /** Сохранить введённое. */
    onSave: () => void;
    /** Отменить правку. */
    onCancel: () => void;
    /** Взять значение из файла. */
    onClear: () => void;
    /** Метка для тестов. */
    testId?: string;
  }

  let {
    label,
    value = '',
    display,
    editing,
    draft = $bindable(''),
    canClear,
    onStart,
    onSave,
    onCancel,
    onClear,
    testId,
  }: Props = $props();
</script>

{#if editing}
  <span class="flex min-w-0 flex-1 items-center gap-1" data-testid="{testId}-editor">
    <Input bind:value={draft} ariaLabel={label} class="min-w-0 flex-1" />
    <Button
      variant="ghost"
      size="icon"
      title={t('app.action.save')}
      ariaLabel={t('app.action.save')}
      testId="{testId}-save"
      onclick={onSave}
    >
      <Icon name="check" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      title={t('app.action.undo')}
      ariaLabel={t('app.action.undo')}
      testId="{testId}-cancel"
      onclick={onCancel}
    >
      <Icon name="close" />
    </Button>
    {#if canClear}
      <Button
        variant="ghost"
        size="icon"
        title={t('app.library.book.reset')}
        ariaLabel={t('app.library.book.reset')}
        testId="{testId}-clear"
        onclick={onClear}
      >
        <Icon name="refresh" />
      </Button>
    {/if}
  </span>
{:else}
  <span class="flex min-w-0 items-center gap-1" data-testid={testId}>
    {#if display}
      {@render display()}
    {:else}
      <span class="min-w-0 break-words role-body">{value}</span>
    {/if}
    <IconButton
      action="edit"
      size="sm"
      title={t('app.library.book.edit')}
      ariaLabel={label}
      onclick={onStart}
    />
  </span>
{/if}
