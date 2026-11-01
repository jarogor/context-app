<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button, ErrorToast, ScrollArea, UiRenderer, collectValues, createAsyncState } from '@context/ui';
  import { t } from '@context/i18n';
  import type { UiIntent, UiNode, UiSpaceDeclaration } from '@context/ui-schema';
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
    /**
     * Показывать только перечисленные секции.
     *
     * Раздел настроек может собирать секции разных владельцев: «Система»
     * показывает техническую секцию приложения рядом с обновлениями, а «Общие» —
     * остальные. Фильтр применяется к декларациям, а не к разметке, поэтому
     * сохранение, черновик и подсветка изменений остаются общими.
     */
    only?: readonly string[];
    /**
     * Встроенный режим: без собственной прокрутки и рамки страницы.
     *
     * Нужен, когда секции рисуются внутри чужой страницы (например, в разделе
     * «Система» рядом с обновлениями): внешняя прокрутка уже есть, а вложенная
     * дала бы двойную полосу.
     */
    embedded?: boolean;
  }

  let { initialDeclarations, initialError = '', only, embedded = false }: Props = $props();

  /** Декларации пространства «секция настроек», отданные плагином. */
  let declarations = $state<NormalizedDeclaration[]>(untrack(() => initialDeclarations ?? []));

  /** Постоянная нижняя панель сохранения: у встроенного режима её нет. */
  const ownFooter = $derived(!embedded);

  /** Декларации с учётом фильтра секций. */
  const visible = $derived(
    only
      ? declarations.filter(
          (item) => item.declaration && only.includes(item.declaration.id),
        )
      : declarations,
  );
  /** Черновик значений по идентификатору секции (правки до сохранения). */
  let draft = $state<Record<string, Record<string, unknown>>>({});
  /** Сохранённые значения по идентификатору секции: источник для сравнения. */
  let saved = $state<Record<string, Record<string, unknown>>>({});

  /** Состояние загрузки и ошибок страницы настроек. */
  const asyncState = createAsyncState();

  /** Секции, изменение которых страница инициировала сама.
   *
   * Своё сохранение возвращает те же декларации, что и событие
   * `settings:changed`, поэтому повторная загрузка по событию для этих секций
   * только задерживала отклик. Набор очищается после применения события.
   */
  let ignoreChanged = new Set<string>();

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

  /** Сохранение черновика всех секций одним неделимым действием.
   *
   * Интерфейс не ждёт записи: значения сразу считаются сохранёнными (кнопка
   * гаснет, раздел можно закрыть), а запись идёт в фоне. Ошибка записи
   * возвращает черновик и показывается сообщением, поэтому неудачное сохранение
   * не теряется молча.
   */
  function save() {
    const sections: SettingsSectionValues[] = Object.entries(draft).map(([section, values]) => ({
      section,
      values,
    }));
    if (sections.length === 0) {
      return;
    }
    const pending = draft;
    // Своё сохранение уже возвращает актуальные декларации, поэтому ответ на
    // событие `settings:changed` для этих секций не нужен: повторная загрузка
    // всего интерфейса настроек задерживала отклик на закрытие раздела.
    ignoreChanged = new Set(sections.map((item) => item.section));
    // Кнопка гаснет сразу: правки приняты, ждать записи незачем.
    draft = {};
    void writeSections(sections, pending);
  }

  /** Фоновая запись значений и разбор результата.
   *
   * Отдельно от `save`, чтобы отклик интерфейса не зависел от времени записи в
   * хранилище плагина.
   *
   * Дерево деклараций после сохранения **не подменяется**: состав полей при
   * записи значений не меняется, а замена дерева заставляла `UiRenderer`
   * пересобрать все контролы и вернуть черновик — страница перерисовывалась
   * целиком в тот момент, когда пользователь закрывает раздел, и это давало
   * заметную паузу при большом числе настроек. Обновляется только база
   * сохранённых значений и только у записанных секций.
   */
  async function writeSections(
    sections: SettingsSectionValues[],
    pending: Record<string, Record<string, unknown>>,
  ) {
    const result = await asyncState.run(() => saveSettingsSections(sections));
    if (!result) {
      // Запись не удалась: возвращаем правки, чтобы их не потерять.
      draft = pending;
      return;
    }
    asyncState.error = result.error;
    if (result.error) {
      draft = pending;
      return;
    }
    const savedIds = new Set(sections.map((item) => item.section));
    const nextSaved = { ...saved };
    for (const item of result.declarations) {
      const declaration = item.declaration;
      if (declaration && savedIds.has(declaration.id)) {
        nextSaved[declaration.id] = valuesFromNodes(declaration.nodes);
      }
    }
    saved = nextSaved;
  }

  /** Обновление черновика секции из контролов. */
  function updateDraft(id: string, values: Record<string, unknown>) {
    draft = { ...draft, [id]: values };
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('settings:changed', (value) => {
        // Событие о собственных сохранённых секциях повторной загрузки не
        // требует: декларации уже пришли ответом на сохранение. Чужие секции
        // (например, изменённые плагином) применяются как прежде.
        const section = (value as { section?: unknown } | null)?.section;
        if (typeof section === 'string' && ignoreChanged.has(section)) {
          ignoreChanged.delete(section);
          return;
        }
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

{#snippet sectionsContent()}
  {#if visible.length === 0}
    <div class="p-6 text-center role-body text-[var(--muted-foreground)]">
      {t('app.settings.empty')}
    </div>
  {:else}
    {#each visible as item, index (item.declaration?.id ?? index)}
      {#if item.declaration}
        <section
          class="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5"
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
{/snippet}

{#snippet footerContent()}
  <!--
    Встроенная панель сохранения показывается только при несохранённых правках:
    страница-хозяин («Система») живёт без постоянной нижней полосы, и кнопка не
    висит посреди содержимого, когда сохранять нечего.
  -->
  {#if ownFooter || dirty}
    <div
      class="flex flex-none flex-wrap items-center justify-between gap-3 {embedded
        ? 'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-4 py-3'
        : 'border-t border-[var(--border)] bg-[var(--panel)] px-4 py-3'}"
      data-testid="settings-footer"
      style={embedded ? '' : 'padding-bottom: max(0.75rem, var(--safe-bottom));'}
    >
      <span class="role-caption text-[var(--muted-foreground)]">
        {dirty ? t('app.settings.dirty') : t('app.settings.saved')}
      </span>
      <Button variant="primary" disabled={!dirty} onclick={save}>{t('app.action.save')}</Button>
    </div>
  {/if}
{/snippet}

{#if embedded}
  <!--
    Встроенный режим: секции рисуются внутри чужой страницы (раздел «Система»).
    Собственной прокрутки нет — она уже есть у страницы-хозяина; кнопка
    сохранения остаётся, но без отдельной нижней панели.
  -->
  <div class="flex w-full flex-col gap-6" data-testid="settings-embedded">
    {@render sectionsContent()}
    {@render footerContent()}
  </div>
{:else}
  <div class="flex min-h-0 flex-1 flex-col" data-testid="settings-page">
    <ScrollArea testId="settings-sections" class="p-4 md:p-6">
      <div class="mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-6">
        {@render sectionsContent()}
      </div>
    </ScrollArea>
    {@render footerContent()}
  </div>
{/if}

<ErrorToast message={asyncState.error} />
