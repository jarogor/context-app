import { describe, expect, it } from 'vitest';
import { captureAnchor, restoreAnchor } from './zoom-anchor';

describe('удержание места чтения', () => {
  it('без документа даёт пустую опору', () => {
    expect(captureAnchor(null)).toEqual({ range: null, top: 0 });
  });

  it('восстановление без опоры ничего не делает', () => {
    expect(() => restoreAnchor(null, { range: null, top: 0 })).not.toThrow();
  });
});
