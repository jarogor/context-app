<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '@context/i18n';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import Input from './Input.svelte';
  import Textarea from './Textarea.svelte';

  /**
   * Правка текстового свойства сущности: названия или описания.
   *
   * Один компонент на все места, где пользователь задаёт название и описание
   * (вкладка рабочего места, библиотека): форма и клавиши одинаковы везде.
   * Черновик живёт внутри компонента, поэтому отмена не меняет сохранённое
   * значение; чтобы при смене свойства форма показала новое значение, вызывающая
   * сторона задаёт новый экземпляр (`{#key}`).
   */
  interface Props {
    /** Подпись поля для доступности и подсказки пустого значения. */
    label: string;
    /** Текущее значение свойства. */
    value: string;
    /** Многострочное поле: у описания, а не у названия. */
    multiline?: boolean;
    /** Метка контейнера формы для тестов. */
    testId?: string;
    /** Сохранение значения; пустая строка снимает свойство. */
    onSave: (value: string) => void;
    /** Закрытие без сохранения. */
    onCancel: () => void;
  }

  let { label, value, multiline = false, testId, onSave, onCancel }: Props = $props();

  /** Черновик поля: до подтверждения сохранённое значение не меняется.
   *
   * Значение берётся при создании формы: вызывающая сторона создаёт новый
   * экземпляр на каждое свойство (`{#key}`), поэтому подписка на проп не нужна.
   */
  let draft = $state(untrack(() => value));

  /** Поле формы: фокус ставится в него сразу после открытия. */
  let field = $state<HTMLInputElement | HTMLTextAreaElement | undefined>();

  $effect(() => {
    field?.focus();
  });

  /**
   * Клавиши поля.
   *
   * Enter сохраняет **только название**, `Ctrl+Enter` — только описание: поля
   * разной природы, и одно нажатие не должно подменять другое. Escape снимает
   * правку через общий слой закрытия — собственного обработчика у формы нет,
   * иначе одно нажатие закрывало бы два слоя сразу.
   */
  function handleKey(event: KeyboardEvent) {
    if (event.key !== 'Enter') {
      return;
    }
    if (multiline && !(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    save();
  }

  /** Сохранение введённого значения без внешних пробелов. */
  function save() {
    onSave(draft.trim());
  }

  /** Очистка поля: пустое значение снимает свойство. */
  function clear() {
    draft = '';
    save();
  }
</script>

<div class="flex flex-col gap-2" data-testid={testId}>
  {#if multiline}
    <Textarea
      bind:value={draft}
      bind:element={field as HTMLTextAreaElement | undefined}
      placeholder={label}
      ariaLabel={label}
      rows={2}
      onkeydown={handleKey}
    />
  {:else}
    <Input
      bind:value={draft}
      bind:element={field as HTMLInputElement | undefined}
      placeholder={label}
      ariaLabel={label}
      onkeydown={handleKey}
    />
  {/if}
  <div class="flex items-center justify-between gap-2">
    <IconButton
      action="delete"
      title={t('app.action.clear')}
      ariaLabel={t('app.action.clearField')}
      disabled={!draft}
      onclick={clear}
    />
    <div class="flex items-center gap-2">
      <Button
        variant="secondary"
        size="icon"
        title={t('app.reader.cancel')}
        ariaLabel={t('app.reader.cancel')}
        onclick={onCancel}
      >
        <Icon name="close" />
      </Button>
      <Button
        variant="primary"
        size="icon"
        title={t('app.action.save')}
        ariaLabel={t('app.action.save')}
        onclick={save}
      >
        <Icon name="check" />
      </Button>
    </div>
  </div>
</div>
