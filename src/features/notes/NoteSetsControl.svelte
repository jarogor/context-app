<script lang="ts">
  import { ActionMenu, Button, Input, Select, type MenuAction } from '@context/ui';
  import type { NoteSetSummary } from './notes';

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

  /** Активный набор среди наборов книги. */
  const activeSet = $derived(sets.find((set) => set.id === activeSetId) ?? null);

  /** Варианты выпадающего списка наборов: имя и число заметок. */
  const setOptions = $derived(
    sets.map((set) => ({ value: set.id, label: `${set.name} (${set.noteCount})` })),
  );

  /** Пункты меню набора заметок. */
  const setActions = $derived<MenuAction[]>([
    { id: 'create', label: 'Новый набор' },
    { id: 'rename', label: 'Переименовать', disabled: !activeSet },
    { id: 'delete', label: 'Удалить', destructive: true, disabled: !activeSet },
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
      <span class="role-caption text-[var(--muted-foreground)]">Имя набора</span>
      <Input
        bind:value={newSetName}
        placeholder="Новый набор"
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            commitCreate();
          }
          if (event.key === 'Escape') {
            creating = false;
          }
        }}
      />
    </label>
    <div class="flex gap-2">
      <Button variant="primary" size="sm" disabled={!newSetName.trim()} onclick={commitCreate}>
        Создать
      </Button>
      <Button variant="secondary" size="sm" onclick={() => (creating = false)}>Отмена</Button>
    </div>
  {:else if renaming}
    <label class="flex flex-col gap-1">
      <span class="role-caption text-[var(--muted-foreground)]">Новое имя</span>
      <Input
        bind:value={renameName}
        placeholder="Новое имя"
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            commitRename();
          }
          if (event.key === 'Escape') {
            renaming = false;
          }
        }}
      />
    </label>
    <div class="flex gap-2">
      <Button variant="primary" size="sm" disabled={!renameName.trim()} onclick={commitRename}>
        Сохранить
      </Button>
      <Button variant="secondary" size="sm" onclick={() => (renaming = false)}>Отмена</Button>
    </div>
  {:else}
    <span class="role-eyebrow text-[var(--muted-foreground)]">Набор</span>
    <div class="flex items-center gap-2">
      <Select
        value={activeSetId ?? ''}
        items={setOptions}
        placeholder={sets.length === 0 ? 'Наборов нет' : 'Выберите набор'}
        disabled={sets.length === 0}
        ariaLabel="Набор заметок"
        class="min-w-0 flex-1"
        onchange={changeSet}
      />
      <ActionMenu
        ariaLabel="Действия с набором заметок"
        title="Действия"
        items={setActions}
        onselect={runSetAction}
      />
    </div>
  {/if}
</div>
