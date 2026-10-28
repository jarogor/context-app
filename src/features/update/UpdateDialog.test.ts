import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import UpdateDialog from './UpdateDialog.svelte';

/** Обновление ядра тестового диалога. */
const core = {
    current_version: '0.1.0',
    version: '0.2.0',
    notes: 'Новая версия',
    mode: 'portable',
};

describe('диалог обновлений', () => {
    it('показывает версии и запускает установку', async () => {
        const onApply = vi.fn();
        render(UpdateDialog, {
            open: true,
            core,
            plugins: [],
            currentVersion: '0.1.0',
            busy: false,
            error: '',
            done: false,
            onApply,
            onLater: vi.fn(),
            onSkip: vi.fn(),
            onRestart: vi.fn(),
        });

        expect(screen.getByTestId('update-core').textContent).toContain('0.1.0 → 0.2.0');
        await fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
        expect(onApply).toHaveBeenCalled();
    });

    it('после установки предлагает перезапуск', async () => {
        const onRestart = vi.fn();
        render(UpdateDialog, {
            open: true,
            core: null,
            plugins: [],
            currentVersion: '0.1.0',
            busy: false,
            error: '',
            done: true,
            onApply: vi.fn(),
            onLater: vi.fn(),
            onSkip: vi.fn(),
            onRestart,
        });

        await fireEvent.click(screen.getByRole('button', { name: 'Перезапустить' }));
        expect(onRestart).toHaveBeenCalled();
    });
});
