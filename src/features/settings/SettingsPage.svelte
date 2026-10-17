<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button, ErrorToast, Icon, ScrollArea, UiRenderer, collectValues, createAsyncState } from '@texture/ui';
  import type { UiIntent, UiNode, UiSpaceDeclaration } from '@texture/ui-schema';
  import { listenEvent } from '../../shared/app-bridge';
  import {
    loadSettingsUi,
    saveSettingsSections,
    sendSettingsIntent,
    type NormalizedDeclaration,
    type SettingsSectionValues,
  } from './settings';

  interface Props {
    /** Декларации, загруженные на бутстрапе; `undefined` — загрузить при монтировании. */
    initialDeclarations?: NormalizedDeclaration[];
    /** Ошибка загрузки деклараций на бутстрапе. */
    initialError?: string;
    /** Закрытие полноэкранного раздела настроек. */
    onclose?: () => void;
  }

  let { initialDeclarations, initialError = '', onclose }: Props = $props();

  /** Декларации пространства «секция настроек», отданные плагином. */
  let declarations = $state<NormalizedDeclaration[]>(untrack(() => initialDeclarations ?? []));
  /** Черновик значений по идентификатору секции (правки до сохранения). */
  let draft = $state<Record<string, Record<string, unknown>>>({});
  /** Сохранённые значения по идентификатору секции: источник для сравнения. */
  let saved = $state<Record<string, Record<string, unknown>>>({});

  /** Состояние загрузки и ошибок страницы настроек. */
  const asyncState = createAsyncState();

  // Ошибка, переданная с бутстрапа, показывается сразу при монтировании.
  asyncState.error = untrack(() => initialError);

  /** Значения контролов секции из её декларации. */
  function valuesFromNodes(nodes: UiNode[]): Record<string, unknown> {
    return collectValues(nodes);
  }

  /** Пересборка исходных значений из текущих деклараций. */
  function syncSaved(list: NormalizedDeclaration[]) {
    const next: Record<string, Record<string, unknown>> = {};
    for (const item of list) {
      if (item.declaration) {
        next[item.declaration.id] = valuesFromNodes(item.declaration.nodes);
      }
    }
    saved = next;
  }

  // Исходные значения при первой отрисовке — из деклараций бутстрапа.
  syncSaved(untrack(() => declarations));

  /** Сравнение черновика с сохранённым состоянием по всем секциям. */
  const dirty = $derived.by(() => {
    for (const [id, values] of Object.entries(draft)) {
      const base = saved[id] ?? {};
      const keys = new Set([...Object.keys(base), ...Object.keys(values)]);
      for (const key of keys) {
        if (JSON.stringify(values[key] ?? null) !== JSON.stringify(base[key] ?? null)) {
          return true;
        }
      }
    }
    return false;
  });

  /** Число секций настроек. */
  const sectionCount = $derived(declarations.filter((item) => item.declaration).length);

  /** Загрузка деклараций интерфейса настроек. */
  async function load() {
    const result = await asyncState.run(loadSettingsUi);
    if (result) {
      declarations = result.declarations;
      syncSaved(result.declarations);
      asyncState.error = result.error;
    }
  }

  /** Передача действия плагину и обновление деклараций. */
  async function dispatch(intent: UiIntent) {
    const result = await asyncState.run(() => sendSettingsIntent(intent));
    if (result) {
      declarations = result.declarations;
      syncSaved(result.declarations);
      asyncState.error = result.error;
    }
  }

  /** Сохранение черновика всех секций одним неделимым действием. */
  async function save() {
    const sections: SettingsSectionValues[] = Object.entries(draft).map(([section, values]) => ({
      section,
      values,
    }));
    if (sections.length === 0) {
      return;
    }
    const result = await asyncState.run(() => saveSettingsSections(sections));
    if (result) {
      declarations = result.declarations;
      syncSaved(result.declarations);
      // Черновик синхронизируется с сохранённым состоянием: кнопка снова гаснет.
      draft = {};
      asyncState.error = result.error;
    }
  }

  /** Обновление черновика секции из контролов. */
  function updateDraft(id: string, values: Record<string, unknown>) {
    draft = { ...draft, [id]: values };
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('settings:changed', () => {
        void load();
      });
      // Декларации уже загружены на бутстрапе; без них (в изоляции) грузим сами.
      if (initialDeclarations === undefined) {
        await load();
      }
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<div class="flex min-h-0 flex-1 flex-col" data-testid="settings-page">
  <div
    class="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3 md:px-6"
  >
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="role-eyebrow text-[var(--muted-foreground)]">Приложение</span>
      <span class="role-display text-[var(--foreground)]">Настройки</span>
    </div>
    {#if sectionCount > 0}
      <span class="role-caption text-[var(--muted-foreground)]">
        Секций: {sectionCount}
      </span>
    {/if}
    <Button
      variant="secondary"
      size="icon"
      title="Закрыть настройки"
      ariaLabel="Закрыть настройки"
      onclick={() => onclose?.()}
    >
      <Icon name="close" />
    </Button>
  </div>

  <ScrollArea testId="settings-sections" class="p-4 md:p-6">
    <div class="mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-6">
      {#if declarations.length === 0}
        <div class="p-6 text-center role-body text-[var(--muted-foreground)]">
          Нет зарегистрированных настроек
        </div>
      {:else}
        {#each declarations as item, index (item.declaration?.id ?? index)}
          {#if item.declaration}
            <section
              class="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-raised md:p-5"
              data-testid="settings-section"
            >
              <UiRenderer
                declaration={item.declaration}
                diagnostics={item.diagnostics}
                showGroup
                baseline={saved[(item.declaration as UiSpaceDeclaration).id] ?? {}}
                onintent={dispatch}
                onvalues={(values: Record<string, unknown>) =>
                  updateDraft((item.declaration as UiSpaceDeclaration).id, values)}
              />
            </section>
          {/if}
        {/each}
      {/if}
    </div>
  </ScrollArea>

  <div
    class="flex flex-none items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--panel)] px-4 py-3"
    data-testid="settings-footer"
    style="padding-bottom: max(0.75rem, var(--safe-bottom));"
  >
    <span class="role-caption text-[var(--muted-foreground)]">
      {dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}
    </span>
    <Button variant="primary" disabled={!dirty} onclick={save}>Сохранить</Button>
  </div>
</div>

<ErrorToast message={asyncState.error} />
