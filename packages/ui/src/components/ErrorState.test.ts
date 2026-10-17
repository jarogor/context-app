import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import ErrorState from './ErrorState.svelte';

describe('ErrorState', () => {
  it('показывает сообщение как предупреждение', () => {
    render(ErrorState, { props: { message: 'Не удалось загрузить' } });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Не удалось загрузить');
  });

  it('показывает кнопку повтора только при обработчике', () => {
    render(ErrorState, { props: { message: 'Ошибка' } });

    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });

  it('вызывает повтор по кнопке', async () => {
    const onretry = vi.fn();
    render(ErrorState, { props: { message: 'Ошибка', onretry } });

    screen.getByRole('button', { name: 'Повторить' }).click();
    expect(onretry).toHaveBeenCalledTimes(1);
  });
});
