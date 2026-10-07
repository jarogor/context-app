import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import ErrorToast from './ErrorToast.svelte';

describe('ErrorToast', () => {
  it('показывает сообщение об ошибке', () => {
    render(ErrorToast, { props: { message: 'Что-то пошло не так' } });

    expect(screen.getByRole('alert').textContent).toContain('Что-то пошло не так');
  });

  it('скрывается при пустом сообщении', () => {
    render(ErrorToast, { props: { message: '' } });

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
