<script lang="ts">
  /** Источник обновлений в одном виде для приложения и для плагинов.
   *
   * Разметка не перестраивается при входе в правку: подпись, кнопки и адрес
   * стоят на своих местах всегда, а кнопки правки и добавления лишь
   * блокируются. Форма ввода появляется ниже адреса, поэтому ни подпись, ни
   * кнопки не сдвигаются и отступы не меняются.
   */
  import { t } from '@context/i18n';
  import { Button, Icon, IconButton, Input } from '@context/ui';

  /** Режим формы: просмотр, правка текущего адреса или добавление нового. */
  type Mode = 'view' | 'edit' | 'add';

  interface Props {
    /** Подпись источника. */
    label: string;
    /** Доступное имя поля. */
    ariaLabel: string;
    /** Метка текущего адреса для тестов. */
    testId: string;
    /** Текущий адрес; пустая строка — источник не задан. */
    value: string;
    /** Вид текущего источника: файловый каталог или сетевой адрес. */
    kind?: 'file' | 'network';
    /**
     * Сохранение адреса.
     *
     * Вид источника передаётся вместе с адресом: правка существующего места не
     * должна менять его вид из-за эвристики ввода, иначе файловый путь
     * превращается в `https://…`.
     */
    onSave: (location: string, kind: 'file' | 'network') => void;
    /** Выбор папки вместо ввода адреса. */
    onChooseFolder: () => void;
    /**
     * Возврат встроенного адреса.
     *
     * Действие применяется сразу и закрывает форму: поле ввода не меняется —
     * возвращать к встроенному незачем вводить, это отдельное действие.
     */
    onReset?: () => void;
    /** Добавление ещё одного источника; без него кнопки добавления нет. */
    onAdd?: (location: string, kind: 'file' | 'network') => void;
    /** Подпись действия добавления. */
    addLabel?: string;
  }

  let {
    label,
    ariaLabel,
    testId,
    value,
    kind = 'file',
    onSave,
    onChooseFolder,
    onReset,
    onAdd,
    addLabel = '',
  }: Props = $props();

  /** Текущий режим формы. */
  let mode = $state<Mode>('view');

  /** Черновик адреса. */
  let draft = $state('');

  /** Вид источника в правке: новый адрес наследует его. */
  let draftKind = $state<'file' | 'network'>('file');

  /** Поле ввода: получает курсор сразу после открытия правки или добавления. */
  let field = $state<HTMLInputElement | undefined>();

  /** Постановка курсора в поле после его появления. */
  $effect(() => {
    if (mode !== 'view' && field) {
      field.focus();
    }
  });

  /** Начало правки: адрес и вид берутся у текущего источника. */
  function startEdit() {
    draft = value;
    draftKind = kind;
    mode = 'edit';
  }

  /** Начало добавления: поле пустое, вид определяется вводом. */
  function startAdd() {
    draft = '';
    draftKind = 'file';
    mode = 'add';
  }

  /** Окончание правки без сохранения: разметка возвращается в прежний вид. */
  function cancel() {
    mode = 'view';
  }

  /**
   * Вид источника по введённому адресу.
   *
   * Применяется только при добавлении: там вид ещё не задан. При правке вид
   * берётся у существующего источника и не пересчитывается — иначе файловый
   * путь превращался бы в сетевой адрес.
   */
  function detectKind(location: string): 'file' | 'network' {
    return /^https?:\/\//i.test(location) ? 'network' : 'file';
  }

  /** Сохранение адреса: пустой не принимается. */
  function commit() {
    const location = draft.trim();
    if (!location) {
      return;
    }
    const adding = mode === 'add';
    mode = 'view';
    if (adding) {
      onAdd?.(location, detectKind(location));
    } else {
      onSave(location, draftKind);
    }
  }
</script>

<div class="flex flex-col gap-2">
  <!--
    Кнопки не исчезают при входе в правку, а блокируются: иначе подпись и
    адрес сдвигаются вверх, и место, по которому только что нажали, меняется.
  -->
  <div class="flex flex-wrap items-center justify-between gap-2">
    <span class="role-body">{label}</span>
    <div class="flex items-center gap-2">
      {#if onAdd}
        <Button
          variant="secondary"
          size="icon"
          title={addLabel || t('app.action.add')}
          ariaLabel={addLabel || t('app.action.add')}
          disabled={mode !== 'view'}
          onclick={startAdd}
        >
          <Icon name="plus" />
        </Button>
      {/if}
      <IconButton
        action="edit"
        title={t('app.action.edit')}
        ariaLabel={`${t('app.action.edit')}: ${label}`}
        disabled={mode !== 'view'}
        onclick={startEdit}
      />
    </div>
  </div>

  {#if value}
    <code class="break-all role-mono text-[var(--muted-foreground)]" data-testid={testId}
      >{value}</code
    >
  {:else}
    <p class="role-body text-[var(--muted-foreground)]">{t('app.store.appSourceNone')}</p>
  {/if}

  <!-- Форма появляется ниже адреса: отступы и положение подписи не меняются. -->
  {#if mode !== 'view'}
    <div class="flex flex-wrap items-center gap-2">
      <div class="min-w-[12rem] flex-1">
        <Input
          bind:element={field}
          bind:value={draft}
          placeholder={t('app.store.sourcePlaceholder')}
          ariaLabel={mode === 'add' ? addLabel || ariaLabel : ariaLabel}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              commit();
            }
          }}
        />
      </div>
      {#if mode === 'edit' && onReset}
        <!-- Возврат применяется сразу и закрывает форму: значение поля ввода
             при этом не используется вовсе. -->
        <Button
          variant="secondary"
          size="sm"
          onclick={() => {
            mode = 'view';
            onReset();
          }}
        >
          {t('app.store.sourceReset')}
        </Button>
      {/if}
      <Button
        variant="secondary"
        size="icon"
        title={t('app.store.chooseFolder')}
        ariaLabel={t('app.store.chooseFolder')}
        onclick={onChooseFolder}
      >
        <Icon name="folder" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        title={t('app.reader.cancel')}
        ariaLabel={t('app.reader.cancel')}
        onclick={cancel}
      >
        <Icon name="close" />
      </Button>
      <Button
        variant="primary"
        size="icon"
        title={t('app.action.save')}
        ariaLabel={t('app.action.save')}
        disabled={!draft.trim()}
        onclick={commit}
      >
        <Icon name="check" />
      </Button>
    </div>
  {/if}
</div>
