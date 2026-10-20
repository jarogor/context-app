import { describe, expect, it } from 'vitest';

import { normalizeSharedDictionaries } from './djvm';

/** Байты из шестнадцатеричной строки. */
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Чтение 32-битного числа от старшего байта. */
function u32(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

/** Чанки формы по абсолютному смещению тега `FORM`. */
function chunksOf(bytes: Uint8Array, offset: number): Array<{ id: string; data: Uint8Array }> {
  const chunks: Array<{ id: string; data: Uint8Array }> = [];
  let pos = offset + 12;
  const end = offset + 8 + u32(bytes, offset + 4);
  while (pos + 8 <= end) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const size = u32(bytes, pos + 4);
    chunks.push({ id, data: bytes.slice(pos + 8, pos + 8 + size) });
    pos += 8 + size;
    if (pos % 2 === 1) {
      pos += 1;
    }
  }
  return chunks;
}

/** Составной DJVM: словарь с именем в однобайтовой кодировке и страница, которая на него ссылается. */
const BUNDLED =
  '41542654464f524d00000082444a564d4449524d00000027810002000000400000005effffe5bf3c' +
  '7bcc6d0fcf0c5729ff948b8fa270e368dd136242a2383f00464f524d00000016444a5649446a62' +
  '7a0000000a44494354494f4e415259464f524d00000028444a5655494e464f0000000a0000000000' +
  '0000000000494e434c0000000a3031ff2d612e646a627a';

describe('normalizeSharedDictionaries', () => {
  it('встраивает общий словарь в страницу, ссылающуюся на него включением', () => {
    const input = fromHex(BUNDLED);
    const output = normalizeSharedDictionaries(input);
    expect(output.length).toBeGreaterThan(input.length);
    // Первый компонент — словарь, второй — страница; в страницу добавлен Djbz.
    const pageOffset = u32(output, 27 + 4);
    const chunks = chunksOf(output, pageOffset);
    const djbz = chunks.find((chunk) => chunk.id === 'Djbz');
    expect(djbz).toBeDefined();
    expect(new TextDecoder().decode(djbz?.data)).toBe('DICTIONARY');
  });

  it('возвращает байты без изменений, если общих словарей нет', () => {
    const single = fromHex(
      '41542654464f524d00000016444a5655494e464f0000000a00000000000000000000',
    );
    const output = normalizeSharedDictionaries(single);
    expect(Array.from(output)).toEqual(Array.from(single));
  });

  it('возвращает байты без изменений для нераспознанного заголовка', () => {
    const other = fromHex('00010203');
    expect(Array.from(normalizeSharedDictionaries(other))).toEqual([0, 1, 2, 3]);
  });
});
