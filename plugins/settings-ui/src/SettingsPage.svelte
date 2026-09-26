<script lang="ts">
  import { Badge, Button, Card, Checkbox, Input, Select, Textarea } from '@booklib/ui';
  import type { Field, Section } from './types';

  interface Props {
    sections: Section[];
    onSave: (id: string, values: Record<string, unknown>) => Promise<void>;
  }

  let { sections, onSave }: Props = $props();

  let drafts = $state<Record<string, Record<string, string>>>({});
  let errors = $state<Record<string, string>>({});

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
      await onSave(section.id, values);
    } catch (error) {
      errors[section.id] = String(error);
    }
  }
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
            <Badge>{section.owner}</Badge>
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
