<script lang="ts">
  import { t } from '@context/i18n';
  import { ActionMenu, Button, Input, Select, type MenuAction } from '@context/ui';
  import type { NoteSetSummary } from './notes';
  import { pushDismissLayer } from '../hotkeys/dismiss-layer';

  /**
   * Управление наборами заметок книги.
   *
   * Наборы — единица организации заметок к книге. Здесь выбирают активный
   * набор, создают новый и переименовывают или удаляют текущий. Действия
   * собраны в меню, чтобы случайное удаление было маловероятным.
   */
  interface Props {
    /** Наборы заметок книги. */
    sets: NoteSetSummary[];
    /** Идентификатор активного набора книги. */
    activeSetId: string | null;
    /** Выбор активного набора книги. */
    onSelect: (setId: string) => void;
    /** Создание набора книги с указанным именем. */
    onCreate: (name: string) => void;
    /** Переименование набора книги. */
    onRename: (setId: string, name: string) => void;
    /** Удаление набора книги. */
    onRemove: (setId: string) => void;
  }

  let { sets, activeSetId, onSelect, onCreate, onRename, onRemove }: Props = $props();

  /** Идёт ли ввод имени нового набора. */
  let creating = $state(false);

  /** Черновик имени нового набора. */
  let newSetName = $state('');

  /** Идёт ли переименование активного набора. */
  let renaming = $state(false);

  /** Черновик имени при переименовании. */
  let renameName = $state('');

  /** Регистрация ввода имени набором закрытия.
   *
   * Escape приходит от общего диспетчера действий: ввод сообщает о себе, пока
   * открыт, и снимается в порядке появления вместе с остальными слоями.
   */
  $effect(() => {
    if (!creating && !renaming) {
      return;
    }
    return pushDismissLayer(() => {
      creating = false;
      renaming = false;
    });
  });

  /** Активный набор среди наборов книги. */
  const activeSet = $derived(sets.find((set) => set.id === activeSetId) ?? null);

  /** Варианты выпадающего списка наборов: имя и число заметок. */
  const setOptions = $derived(
    sets.map((set) => ({ value: set.id, label: `${set.name} (${set.noteCount})` })),
  );

  /** Пункты меню набора заметок. */
  const setActions = $derived<MenuAction[]>([
    { id: 'create', label: t('app.notes.sets.new') },
    { id: 'rename', label: t('app.notes.sets.rename'), disabled: !activeSet },
    {
      id: 'delete',
      label: t('app.notes.sets.delete'),
      destructive: true,
      disabled: !activeSet,
    },
  ]);

  /** Начало ввода имени нового набора. */
  function startCreate() {
    creating = true;
    renaming = false;
    newSetName = '';
  }

  /** Создание набора с непустым именем. */
  function commitCreate() {
    const name = newSetName.trim();
    if (!name) {
      return;
    }
    onCreate(name);
    creating = false;
    newSetName = '';
  }

  /** Начало переименования активного набора. */
  function startRename() {
    if (!activeSet) {
      return;
    }
    renaming = true;
    creating = false;
    renameName = activeSet.name;
  }

  /** Подтверждение переименования набора. */
  function commitRename() {
    if (!activeSet) {
      return;
    }
    const name = renameName.trim();
    if (name) {
      onRename(activeSet.id, name);
    }
    renaming = false;
    renameName = '';
  }

  /** Переключение активного набора из списка. */
  function changeSet(setId: string) {
    if (setId && setId !== activeSetId) {
      onSelect(setId);
    }
  }

  /** Выбор действия набора из меню. */
  function runSetAction(action: string) {
    if (action === 'create') {
      startCreate();
    }
    if (action === 'rename') {
      startRename();
    }
    if (action === 'delete' && activeSet) {
      onRemove(activeSet.id);
    }
  }
</script>

<div class="flex flex-col gap-2 border-b border-[var(--border)] p-2.5" data-testid="notes-sets">
  {#if creating}
    <label class="flex flex-col gap-1">
      <span class="role-caption text-[var(--muted-foreground)]"
        >{t('app.notes.sets.nameLabel')}</span
      >
      <Input
        bind:value={newSetName}
        placeholder={t('app.notes.sets.new')}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            commitCreate();
          }
        }}
      />
    </label>
    <div class="flex gap-2">
      <Button variant="primary" size="sm" disabled={!newSetName.trim()} onclick={commitCreate}>
        {t('app.action.create')}
      </Button>
      <Button variant="secondary" size="sm" onclick={() => (creating = false)}
        >{t('app.reader.cancel')}</Button
      >
    </div>
  {:else if renaming}
    <label class="flex flex-col gap-1">
      <span class="role-caption text-[var(--muted-foreground)]"
        >{t('app.notes.sets.newName')}</span
      >
      <Input
        bind:value={renameName}
        placeholder={t('app.notes.sets.newName')}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            commitRename();
          }
        }}
      />
    </label>
    <div class="flex gap-2">
      <Button variant="primary" size="sm" disabled={!renameName.trim()} onclick={commitRename}>
        {t('app.action.save')}
      </Button>
      <Button variant="secondary" size="sm" onclick={() => (renaming = false)}
        >{t('app.reader.cancel')}</Button
      >
    </div>
  {:else}
    <span class="role-eyebrow text-[var(--muted-foreground)]">{t('app.notes.sets.eyebrow')}</span>
    <div class="flex items-center gap-2">
      <Select
        value={activeSetId ?? ''}
        items={setOptions}
        placeholder={sets.length === 0 ? t('app.notes.sets.noSets') : t('app.notes.sets.choose')}
        disabled={sets.length === 0}
        ariaLabel={t('app.notes.sets.label')}
        class="min-w-0 flex-1"
        onchange={changeSet}
      />
      <ActionMenu
        ariaLabel={t('app.notes.sets.actionsLabel')}
        title={t('app.action.actions')}
        items={setActions}
        onselect={runSetAction}
      />
    </div>
  {/if}
</div>
