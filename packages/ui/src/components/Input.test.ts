import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Input from './Input.svelte';

describe('Input', () => {
  it('отображает плейсхолдер и принимает ввод', async () => {
    render(Input, { props: { placeholder: 'Название' } });

    const input = screen.getByPlaceholderText('Название') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Книга' } });

    expect(input.value).toBe('Книга');
  });

  it('недоступен при disabled', () => {
    render(Input, { props: { disabled: true } });

    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  });
});
