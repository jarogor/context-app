import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import Dialog from './Dialog.svelte';

/** Содержимое диалога для теста. */
const children = createRawSnippet(() => ({ render: () => '<p>Тело диалога</p>' }));

describe('Dialog', () => {
  it('показывает заголовок и содержимое при открытии', () => {
    render(Dialog, { props: { open: true, title: 'Выбор места', children } });

    expect(screen.getByText('Выбор места')).toBeTruthy();
    expect(screen.getByText('Тело диалога')).toBeTruthy();
  });

  it('не показывает содержимое, когда закрыт', () => {
    render(Dialog, { props: { open: false, title: 'Выбор места', children } });

    expect(screen.queryByText('Тело диалога')).toBeNull();
  });

  it('сообщает о закрытии по кнопке', async () => {
    const onOpenChange = vi.fn();
    render(Dialog, { props: { open: true, title: 'Выбор места', children, onOpenChange } });

    await fireEvent.click(screen.getByLabelText('Закрыть'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('без showClose не показывает встроенную кнопку закрытия', () => {
    render(Dialog, { props: { open: true, title: 'Закрыть вкладку?', children, showClose: false } });

    expect(screen.queryByLabelText('Закрыть')).toBeNull();
  });
});
