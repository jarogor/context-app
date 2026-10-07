import { describe, expect, it } from 'vitest';

import { createAsyncState } from './async-state.svelte';

describe('createAsyncState', () => {
  it('возвращает результат и снимает состояние загрузки', async () => {
    const state = createAsyncState();

    const result = await state.run(async () => 42);

    expect(result).toBe(42);
    expect(state.loading).toBe(false);
    expect(state.error).toBe('');
  });

  it('записывает ошибку и возвращает undefined', async () => {
    const state = createAsyncState();

    const result = await state.run(async () => {
      throw new Error('сломалось');
    });

    expect(result).toBeUndefined();
    expect(state.loading).toBe(false);
    expect(state.error).toContain('сломалось');
  });

  it('сбрасывает прошлую ошибку перед новой операцией', async () => {
    const state = createAsyncState();
    await state.run(async () => {
      throw new Error('первая');
    });

    await state.run(async () => 'ок');

    expect(state.error).toBe('');
  });
});
