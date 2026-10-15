import { describe, expect, it } from 'vitest';

import { selectionTarget } from './selection';

describe('selectionTarget', () => {
  it('без выделения возвращает null', () => {
    expect(selectionTarget(null)).toBeNull();
  });

  it('свёрнутое выделение игнорируется', () => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    expect(selectionTarget(selection)).toBeNull();
  });
});
