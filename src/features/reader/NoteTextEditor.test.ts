import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NoteTextEditor from './NoteTextEditor.svelte';
import { DEFAULT_NOTE_COLOR } from '../notes/notes';

describe('редактор текстовой заметки', () => {
  it('пустой текст не подтверждается', async () => {
    const onConfirm = vi.fn();
    render(NoteTextEditor, { props: { onConfirm, onCancel: vi.fn() } });

    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('подтверждает непустой текст без внешних пробелов и с цветом', async () => {
    const onConfirm = vi.fn();
    render(NoteTextEditor, { props: { onConfirm, onCancel: vi.fn() } });

    await fireEvent.input(screen.getByLabelText('Текст заметки'), {
      target: { value: '  моя мысль  ' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'фиолетовый' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onConfirm).toHaveBeenCalledWith('моя мысль', 'purple');
  });

  it('в режиме правки берёт начальные текст и цвет заметки', async () => {
    const onConfirm = vi.fn();
    render(NoteTextEditor, {
      props: {
        initialText: 'старый текст',
        initialColor: 'green',
        onConfirm,
        onCancel: vi.fn(),
      },
    });

    expect((screen.getByLabelText('Текст заметки') as HTMLTextAreaElement).value).toBe(
      'старый текст',
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onConfirm).toHaveBeenCalledWith('старый текст', 'green');
  });

  it('по умолчанию подтверждает цвет по умолчанию', async () => {
    const onConfirm = vi.fn();
    render(NoteTextEditor, { props: { onConfirm, onCancel: vi.fn() } });

    await fireEvent.input(screen.getByLabelText('Текст заметки'), {
      target: { value: 'мысль' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onConfirm).toHaveBeenCalledWith('мысль', DEFAULT_NOTE_COLOR);
  });

  it('сообщает об отмене', async () => {
    const onCancel = vi.fn();
    render(NoteTextEditor, { props: { onConfirm: vi.fn(), onCancel } });

    await fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onCancel).toHaveBeenCalled();
  });
});
