import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import Checkbox from './Checkbox.svelte';

describe('Checkbox', () => {
  it('передаёт изменение состояния в обработчик', async () => {
    const onchange = vi.fn();
    render(Checkbox, { props: { onchange } });

    await fireEvent.click(screen.getByRole('checkbox'));

    expect(onchange).toHaveBeenCalledTimes(1);
  });

  it('не активен при disabled', () => {
    render(Checkbox, { props: { disabled: true } });

    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });
});
