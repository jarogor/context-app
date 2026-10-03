<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Card, Checkbox, Input, Select, Textarea } from '@texture/ui';
  import { invokeCommand, listenEvent } from './app-bridge';

  /** Тип поля настроек. */
  type FieldType = 'boolean' | 'string' | 'number' | 'select' | 'json';

  /** Вариант выбора для поля типа `select`. */
  interface FieldOption {
    /** Значение варианта. */
    value: unknown;
    /** Человекочитаемое название варианта. */
    title: string;
  }

  /** Поле настроек секции. */
  interface Field {
    /** Ключ значения в секции. */
    key: string;
    /** Человекочитаемое название поля. */
    title: string;
    /** Тип поля. */
    type: FieldType;
    /** Описание поля. */
    description?: string | null;
    /** Варианты выбора для типа `select`. */
    options?: FieldOption[];
  }

  /** Секция настроек, зарегистрированная владельцем. */
  interface Section {
    /** Полный идентификатор секции в формате `<owner>.<id>`. */
    id: string;
    /** Заголовок секции. */
    title: string;
    /** Описание секции. */
    description?: string | null;
    /** Поля секции. */
    fields: Field[];
    /** Текущие значения секции. */
    values: Record<string, unknown>;
  }

  /** Capability базового плагина настроек. */
  const SETTINGS_CAPABILITY = 'settings.store@1';

  /** Секции настроек. */
  let sections: Section[] = $state([]);

  /** Ошибка загрузки или сохранения настроек. */
  let errorMessage = $state('');

  /** Черновики значений по секциям. */
  let drafts = $state<Record<string, Record<string, string>>>({});

  /** Ошибки валидации и сохранения по секциям. */
  let errors = $state<Record<string, string>>({});

  /** Вызов opaque-операции базового плагина настроек. */
  async function operation<T>(action: string, payload: unknown = {}): Promise<T> {
    return (await invokeCommand('invoke_base_plugin_operation', {
      capability: SETTINGS_CAPABILITY,
      operation: action,
      payload,
    })) as T;
  }

  /** Загрузка списка секций настроек. */
  async function load() {
    try {
      const data = await operation<{ sections: Section[] }>('list', {});
      sections = data.sections;
      errorMessage = '';
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Сохранение значений секции. */
  async function saveSection(id: string, values: Record<string, unknown>) {
    await operation('set', { section: id, values });
    await load();
  }

  /** Преобразование значения поля в строку черновика. */
  function toDraft(field: Field, value: unknown): string {
    if (field.type === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (field.type === 'number') {
      return typeof value === 'number' ? String(value) : '';
    }
    if (field.type === 'json') {
      return JSON.stringify(value ?? null, null, 2);
    }
    return value === undefined || value === null ? '' : String(value);
  }

  /** Преобразование строки черновика в значение поля. */
  function fromDraft(field: Field, draft: string): unknown {
    if (field.type === 'boolean') {
      return draft === 'true';
    }
    if (field.type === 'number') {
      const parsed = Number(draft);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (field.type === 'json') {
      return JSON.parse(draft);
    }
    return draft;
  }

  /** Инициализация черновиков для новых секций и полей. */
  $effect(() => {
    for (const section of sections) {
      const sectionDrafts = { ...(drafts[section.id] ?? {}) };
      let changed = drafts[section.id] === undefined;
      for (const field of section.fields) {
        if (sectionDrafts[field.key] === undefined) {
          sectionDrafts[field.key] = toDraft(field, section.values?.[field.key]);
          changed = true;
        }
      }
      if (changed) {
        drafts = { ...drafts, [section.id]: sectionDrafts };
      }
    }
  });

  /** Изменение значения черновика. */
  function setDraft(sectionId: string, key: string, value: string) {
    drafts = { ...drafts, [sectionId]: { ...(drafts[sectionId] ?? {}), [key]: value } };
  }

  /** Сохранение значений секции. */
  async function save(section: Section) {
    errors[section.id] = '';
    const values: Record<string, unknown> = {};
    for (const field of section.fields) {
      const draft = drafts[section.id]?.[field.key] ?? '';
      try {
        values[field.key] = fromDraft(field, draft);
      } catch {
        errors[section.id] = `Некорректное значение поля «${field.title}»`;
        return;
      }
    }
    try {
      await saveSection(section.id, values);
    } catch (error) {
      errors[section.id] = String(error);
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('settings:changed', () => {
        void load();
      });
      await load();
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<div class="flex flex-col gap-[var(--space-4)] p-[var(--space-4)]">
  {#if sections.length === 0}
    <div class="p-[var(--space-5)] text-center text-[var(--color-text-muted)]">
      Нет зарегистрированных настроек
    </div>
  {:else}
    {#each sections as section (section.id)}
      <Card>
        <div class="flex items-start justify-between gap-[var(--space-3)]">
          <div>
            <h2 class="mb-[var(--space-1)] text-base font-semibold">{section.title}</h2>
          </div>
          <Button variant="secondary" onclick={() => save(section)}>Сохранить</Button>
        </div>
        {#if section.description}
          <p class="mb-[var(--space-3)] text-[13px] text-[var(--color-text-muted)]">
            {section.description}
          </p>
        {/if}
        <div class="flex flex-col gap-[var(--space-3)]">
          {#each section.fields as field (field.key)}
            <div class="flex flex-col gap-[var(--space-1)]">
              {#if field.type === 'boolean'}
                <label class="flex items-center gap-[var(--space-2)] text-[13px]">
                  <Checkbox
                    checked={drafts[section.id]?.[field.key] === 'true'}
                    onchange={(event) => {
                      setDraft(
                        section.id,
                        field.key,
                        event.currentTarget.checked ? 'true' : 'false',
                      );
                      void save(section);
                    }}
                  />
                  <span>{field.title}</span>
                </label>
              {:else}
                <label class="text-[13px] text-[var(--color-text-muted)]" for={`${section.id}-${field.key}`}>
                  {field.title}
                </label>
                {#if field.type === 'number'}
                  <Input
                    id={`${section.id}-${field.key}`}
                    type="number"
                    value={drafts[section.id]?.[field.key] ?? ''}
                    oninput={(event) => setDraft(section.id, field.key, event.currentTarget.value)}
                  />
                {:else if field.type === 'select'}
                  <Select
                    id={`${section.id}-${field.key}`}
                    value={drafts[section.id]?.[field.key] ?? ''}
                    class="max-w-[420px]"
                    onchange={(event) => {
                      setDraft(section.id, field.key, event.currentTarget.value);
                      void save(section);
                    }}
                  >
                    {#each field.options ?? [] as option}
                      <option value={String(option.value)}>{option.title}</option>
                    {/each}
                  </Select>
                {:else if field.type === 'json'}
                  <Textarea
                    id={`${section.id}-${field.key}`}
                    class="min-h-[100px] font-mono text-[13px]"
                    value={drafts[section.id]?.[field.key] ?? ''}
                    oninput={(event) => setDraft(section.id, field.key, event.currentTarget.value)}
                  />
                {:else}
                  <Input
                    id={`${section.id}-${field.key}`}
                    value={drafts[section.id]?.[field.key] ?? ''}
                    oninput={(event) => setDraft(section.id, field.key, event.currentTarget.value)}
                  />
                {/if}
              {/if}
              {#if field.description}
                <p class="text-xs text-[var(--color-text-muted)]">{field.description}</p>
              {/if}
            </div>
          {/each}
        </div>
        {#if errors[section.id]}
          <p class="mt-[var(--space-2)] text-[13px] text-[var(--color-danger)]">{errors[section.id]}</p>
        {/if}
      </Card>
    {/each}
  {/if}
</div>

{#if errorMessage}
  <div
    class="fixed right-[8px] bottom-[8px] left-[8px] z-10 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-[var(--space-2)] text-xs text-[var(--color-danger)]"
    role="alert"
  >
    {errorMessage}
  </div>
{/if}
