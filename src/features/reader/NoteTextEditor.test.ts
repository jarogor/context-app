import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NoteTextEditor from './NoteTextEditor.svelte';

describe('редактор текстовой заметки', () => {
    it('пустой текст не подтверждается', async () => {
        const onConfirm = vi.fn();
        render(NoteTextEditor, { props: { onConfirm, onCancel: vi.fn() } });

        await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('подтверждает непустой текст без внешних пробелов', async () => {
        const onConfirm = vi.fn();
        render(NoteTextEditor, { props: { onConfirm, onCancel: vi.fn() } });

        await fireEvent.input(screen.getByLabelText('Текст заметки'), {
            target: { value: '  моя мысль  ' },
        });
        await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

        expect(onConfirm).toHaveBeenCalledWith('моя мысль');
    });

    it('сообщает об отмене', async () => {
        const onCancel = vi.fn();
        render(NoteTextEditor, { props: { onConfirm: vi.fn(), onCancel } });

        await fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

        expect(onCancel).toHaveBeenCalled();
    });
});
