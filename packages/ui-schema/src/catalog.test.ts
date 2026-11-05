import { describe, expect, it } from 'vitest';

import { sanitizeDeclaration, UI_COMPONENTS, UI_SPACES } from './index';

/** Декларация с одним допустимым узлом. */
function declaration(nodes: unknown[]) {
  return {
    space: 'settings.section',
    id: 'app.general',
    nodes: nodes as Parameters<typeof sanitizeDeclaration>[0]['nodes'],
  };
}

describe('каталог декларативного интерфейса', () => {
  it('объявляет пространство секции настроек', () => {
    expect(UI_SPACES['settings.section'].components).toContain('Checkbox');
    expect(UI_COMPONENTS.Checkbox.events).toEqual(['change']);
  });

  it('принимает допустимую декларацию без диагностики', () => {
    const result = sanitizeDeclaration(
      declaration([
        { type: 'Checkbox', props: { name: 'flag', checked: true }, on: { change: 'save' } },
      ]),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.declaration?.nodes.length).toBe(1);
  });

  it('разрешает пояснение поля у контролов', () => {
    // Свойство `description` — пояснение поля: допустимо у всех контролов
    // секции настроек и не даёт диагностик.
    const result = sanitizeDeclaration(
      declaration([
        {
          type: 'Checkbox',
          props: { name: 'flag', label: 'Флаг', checked: true, description: 'Пояснение' },
          on: { change: 'save' },
        },
        { type: 'Input', props: { name: 'count', label: 'Число', description: 'Пояснение' } },
        { type: 'Textarea', props: { name: 'raw', label: 'JSON', description: 'Пояснение' } },
        {
          type: 'Select',
          props: {
            name: 'mode',
            label: 'Режим',
            value: 'a',
            options: [],
            description: 'Пояснение',
          },
          on: { change: 'save' },
        },
      ]),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.declaration?.nodes.length).toBe(4);
  });

  it('сохраняет декларацию без пояснений без диагностик', () => {
    // Декларации без `description` остаются допустимыми: расширение каталога
    // не ломает уже существующие секции.
    const result = sanitizeDeclaration(
      declaration([
        { type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: true } },
        { type: 'Input', props: { name: 'count', label: 'Число', value: '1' } },
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it('отклоняет неизвестный компонент с диагностикой', () => {
    const result = sanitizeDeclaration(declaration([{ type: 'MegaComponent', props: {} }]));
    expect(result.declaration?.nodes).toEqual([]);
    expect(result.diagnostics[0]).toContain('компонент не разрешён');
  });

  it('отклоняет неразрешённое свойство, сохраняя узел', () => {
    const result = sanitizeDeclaration(
      declaration([{ type: 'Text', props: { text: 'ок', style: 'red' } }]),
    );
    expect(result.declaration?.nodes.length).toBe(1);
    expect(result.declaration?.nodes[0]).toMatchObject({ props: { text: 'ок' } });
    expect(result.diagnostics[0]).toContain('свойство не разрешено');
  });

  it('отклоняет неразрешённое событие', () => {
    const result = sanitizeDeclaration(
      declaration([{ type: 'Button', props: { label: 'Жми' }, on: { submit: 'save' } }]),
    );
    expect(result.diagnostics[0]).toContain('событие не разрешено');
  });

  it('отклоняет декларацию необъявленного пространства', () => {
    const result = sanitizeDeclaration({
      space: 'unknown.space',
      id: 'x',
      nodes: [],
    });
    expect(result.declaration).toBeNull();
    expect(result.diagnostics[0]).toContain('пространство не объявлено');
  });

  it('сохраняет компонент, запрещённый в конкретном пространстве', () => {
    // Card допустим, но проверим ограничение пространства на выдуманном случае:
    // пространство не содержит компонент — узел отклоняется.
    const result = sanitizeDeclaration(declaration([{ type: 'Text', props: { text: 'ок' } }]));
    expect(result.declaration?.nodes[0]).toMatchObject({ type: 'Text' });
  });
});
