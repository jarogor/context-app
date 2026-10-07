import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import EntityList from './EntityList.svelte';

/** Сниппет с заданным текстом. */
function text(value: string) {
  return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

/** Элемент списка для теста. */
interface Row {
  id: string;
  name: string;
}

const rows: Row[] = [
  { id: 'a', name: 'Первое' },
  { id: 'b', name: 'Второе' },
];

describe('EntityList', () => {
  it('рисует пункты с метаинформацией и действиями', () => {
    render(EntityList<Row>, {
      props: {
        items: rows,
        key: (item) => item.id,
        itemTestId: 'row',
        titleContent: createRawSnippet((item: () => Row) => ({
          render: () => `<span>${item().name}</span>`,
        })),
        metaItems: (item) => [{ value: item.name, testId: 'row-meta' }],
        metaTestId: 'row-meta-wrap',
        actions: () => [{ id: 'open', label: 'Открыть' }],
        actionsLabel: 'Действия с элементом',
        onAction: vi.fn(),
      },
    });

    expect(screen.getAllByTestId('row')).toHaveLength(2);
    expect(screen.getAllByTestId('row-meta-wrap')).toHaveLength(2);
    expect(screen.getAllByLabelText('Действия с элементом')).toHaveLength(2);
  });

  it('сообщает о выборе пункта', async () => {
    const onSelect = vi.fn();

    render(EntityList<Row>, {
      props: {
        items: [rows[0]],
        key: (item) => item.id,
        titleContent: text('Первое'),
        onSelect,
      },
    });

    await fireEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledWith(rows[0]);
  });

  it('отмечает текущий и недоступный пункт', () => {
    render(EntityList<Row>, {
      props: {
        items: rows,
        key: (item) => item.id,
        itemTestId: 'row',
        buttonTestId: 'row-button',
        titleContent: text('Пункт'),
        selected: (item) => item.id === 'a',
        disabled: (item) => item.id === 'b',
      },
    });

    const buttons = screen.getAllByTestId('row-button');
    expect(buttons[0].getAttribute('aria-current')).toBe('true');
    expect(buttons[1].getAttribute('aria-current')).toBeNull();
    expect(buttons[1].hasAttribute('disabled')).toBe(true);
  });

  it('показывает состояние «ничего не найдено»', () => {
    render(EntityList<Row>, {
      props: {
        items: [],
        key: (item) => item.id,
        titleContent: text('Пункт'),
        notFound: true,
        notFoundTestId: 'none',
      },
    });

    expect(screen.getByTestId('none')).toBeTruthy();
  });

  it('рисует дополнительное содержимое под пунктом', () => {
    render(EntityList<Row>, {
      props: {
        items: [rows[0]],
        key: (item) => item.id,
        container: 'div',
        itemTestId: 'row',
        titleContent: text('Первое'),
        body: createRawSnippet((item: () => Row) => ({
          render: () => `<span data-testid="row-body">${item().name}</span>`,
        })),
      },
    });

    expect(screen.getByTestId('row-body').textContent).toBe('Первое');
  });

  it('подменяет строку содержимым редактирования', () => {
    render(EntityList<Row>, {
      props: {
        items: [rows[0]],
        key: (item) => item.id,
        itemTestId: 'row',
        titleContent: text('Первое'),
        isEditing: () => true,
        editContent: text('Редактор'),
      },
    });

    expect(screen.getByText('Редактор')).toBeTruthy();
    expect(screen.queryByText('Первое')).toBeNull();
  });
});
