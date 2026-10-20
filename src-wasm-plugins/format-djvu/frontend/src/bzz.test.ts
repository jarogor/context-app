import { describe, expect, it } from 'vitest';

import { bzzDecode } from './bzz';

/** Байты из шестнадцатеричной строки. */
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe('bzzDecode', () => {
  it('декодирует метаданные каталога с именами в однобайтовой кодировке', () => {
    const encoded = fromHex('ffffe5bf3c7bcf184fc54a62c67adcc109fbc20e26296af8845ee517');
    const decoded = bzzDecode(encoded);
    const expected = fromHex('00001800002800013031ff2d612e646a627a00703030303000');
    expect(Array.from(decoded)).toEqual(Array.from(expected));
  });

  it('отвергает поток короче двух байт', () => {
    expect(() => bzzDecode(new Uint8Array(1))).toThrow();
    expect(() => bzzDecode(new Uint8Array(0))).toThrow();
  });
});
