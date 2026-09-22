<script lang="ts">
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

<div class="settings-content">
  {#if sections.length === 0}
    <div class="empty-state">Нет зарегистрированных настроек</div>
  {:else}
    {#each sections as section (section.id)}
      <section class="settings-section">
        <div class="section-header">
          <div>
            <h2>{section.title}</h2>
            <span class="owner-badge">{section.owner}</span>
          </div>
          <button type="button" onclick={() => save(section)}>Сохранить</button>
        </div>
        {#if section.description}
          <p class="description">{section.description}</p>
        {/if}
        <div class="fields">
          {#each section.fields as field (field.key)}
            <div class="field">
              {#if field.type === 'boolean'}
                <label class="field-checkbox">
                  <input
                    type="checkbox"
                    checked={drafts[section.id]?.[field.key] === 'true'}
                    onchange={(event) =>
                      setDraft(section.id, field.key, event.currentTarget.checked ? 'true' : 'false')}
                  />
                  <span>{field.title}</span>
                </label>
              {:else}
                <label class="field-label" for="{section.id}-{field.key}">{field.title}</label>
                {#if field.type === 'number'}
                  <input
                    id="{section.id}-{field.key}"
                    type="number"
                    value={drafts[section.id]?.[field.key] ?? ''}
                    oninput={(event) => setDraft(section.id, field.key, event.currentTarget.value)}
                  />
                {:else if field.type === 'select'}
                  <select
                    id="{section.id}-{field.key}"
                    value={drafts[section.id]?.[field.key] ?? ''}
                    onchange={(event) => setDraft(section.id, field.key, event.currentTarget.value)}
                  >
                    {#each field.options ?? [] as option}
                      <option value={String(option.value)}>{option.title}</option>
                    {/each}
                  </select>
                {:else if field.type === 'json'}
                  <textarea
                    id="{section.id}-{field.key}"
                    spellcheck="false"
                    value={drafts[section.id]?.[field.key] ?? ''}
                    oninput={(event) => setDraft(section.id, field.key, event.currentTarget.value)}
                  ></textarea>
                {:else}
                  <input
                    id="{section.id}-{field.key}"
                    type="text"
                    value={drafts[section.id]?.[field.key] ?? ''}
                    oninput={(event) => setDraft(section.id, field.key, event.currentTarget.value)}
                  />
                {/if}
              {/if}
              {#if field.description}
                <p class="field-description">{field.description}</p>
              {/if}
            </div>
          {/each}
        </div>
        {#if errors[section.id]}
          <p class="error">{errors[section.id]}</p>
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .settings-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .settings-section {
    padding: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: #fff;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .section-header h2 {
    margin: 0 0 4px;
    font-size: 16px;
  }

  .owner-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    background: #ecf0f1;
    color: #566573;
    font-size: 11px;
  }

  .section-header button {
    padding: 6px 12px;
    border: 1px solid #5a8fda;
    border-radius: 6px;
    background: #fff;
    color: #315f9e;
    font: inherit;
    cursor: pointer;
  }

  .section-header button:hover {
    background: #eef5ff;
  }

  .description {
    margin: 0 0 12px;
    color: #666;
    font-size: 13px;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    font-size: 13px;
    color: #444;
  }

  .field-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #444;
    cursor: pointer;
  }

  .field input[type='text'],
  .field input[type='number'],
  .field select,
  .field textarea {
    box-sizing: border-box;
    width: 100%;
    max-width: 420px;
    padding: 7px 9px;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    font: inherit;
  }

  .field textarea {
    min-height: 100px;
    font-family: monospace;
    font-size: 13px;
    resize: vertical;
  }

  .field-description {
    margin: 0;
    color: #888;
    font-size: 12px;
  }

  .error {
    margin: 8px 0 0;
    color: #c0392b;
    font-size: 13px;
  }

  .empty-state {
    text-align: center;
    color: #999;
    padding: 40px 16px;
  }
</style>
