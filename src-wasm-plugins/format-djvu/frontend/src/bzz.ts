/** Декодер BZZ — сжатия служебных чанков DjVu (`DIRM`, `NAVM`, `ANTz`).
 *
 * BZZ сочетает адаптивный арифметический кодек ZP, преобразование
 * «переместить-в-начало» (MTF) и обратное преобразование Бёрроуза — Уилера
 * (BWT). Декодер нужен, чтобы прочитать идентификаторы компонентов `DIRM`:
 * движок чтения принимает имена включений (`INCL`) только в UTF-8, а во
 * встречающихся на практике файлах они записаны в однобайтовой кодировке.
 * Разбор каталога позволяет сопоставить страницы с их общими словарями.
 *
 * Порт с `djvu-bzz` (MIT, https://github.com/matyushkin/djvu-rs).
 */
import { LPS_NEXT, MPS_NEXT, PROB, THRESHOLD } from './bzz-tables';

/** Число контекстов ZP на блок. */
const CTX_COUNT = 300;

/** Число «частотных» слотов в порядке MTF. */
const FREQ_SLOTS = 4;

/** Число контекстов первых двух уровней MTF. */
const LEVEL_CTXIDS = 3;

/** Предельный размер блока (4 МиБ), как `MAXBLOCK` в DjVuLibre. */
const MAX_BLOCK_SIZE = 4 * 1024 * 1024;

/** Предельный размер результата (256 МиБ). */
const MAX_OUTPUT_SIZE = 256 * 1024 * 1024;

/** Число подряд прочитанных «синтетических» байт, после которого поток
 * считается исчерпанным: защита от «бомбы» декодирования. */
const EOF_SLACK = 16;

/** Проверка исчерпания потока выполняется раз в столько символов. */
const SPIN_CHECK_INTERVAL = 4096;

/** Число ведущих единичных бит в младших 16 битах значения. */
function leadingOnes16(value: number): number {
  const v = value & 0xffff;
  let count = 0;
  for (let bit = 15; bit >= 0; bit -= 1) {
    if ((v & (1 << bit)) === 0) {
      break;
    }
    count += 1;
  }
  return count;
}

/** Адаптивный арифметический декодер ZP. */
class ZpDecoder {
  /** Регистр ширины интервала. */
  private a = 0;

  /** Регистр кода. */
  private c = 0;

  /** Верхняя граница быстрого пути. */
  private fence = 0;

  /** Буфер бит. */
  private bitBuf = 0;

  /** Число годных бит в буфере. */
  private bitCount = 0;

  /** Позиция чтения; растёт и за концом данных (синтетические `0xff`). */
  pos = 0;

  constructor(private readonly data: Uint8Array) {
    if (data.length < 2) {
      throw new Error('BZZ: поток короче двух байт');
    }
    const high = this.readByte();
    const low = this.readByte();
    this.c = (high << 8) | low;
    this.refill();
    this.fence = Math.min(this.c, 0x7fff);
  }

  /** Чтение очередного байта; за концом данных возвращается `0xff`. */
  private readByte(): number {
    const byte = this.pos < this.data.length ? this.data[this.pos] : 0xff;
    this.pos += 1;
    return byte;
  }

  /** Пополнение буфера бит до 24 значащих бит. */
  private refill(): void {
    while (this.bitCount <= 24) {
      this.bitBuf = ((this.bitBuf << 8) | this.readByte()) >>> 0;
      this.bitCount += 8;
    }
  }

  /** Декодирование одного бита в контексте `ctx[index]`. */
  decodeBit(ctx: Uint8Array, index: number): boolean {
    const state = ctx[index];
    const mps = state & 1;
    const z = this.a + PROB[state];
    if (z <= this.fence) {
      this.a = z;
      return mps !== 0;
    }
    const boundary = 0x6000 + ((this.a + z) >> 2);
    const clamped = Math.min(z, boundary);
    if (clamped > this.c) {
      const complement = 0x10000 - clamped;
      this.a = (this.a + complement) & 0xffff;
      this.c = (this.c + complement) & 0xffff;
      ctx[index] = LPS_NEXT[state];
      this.renormalize();
      return 1 - mps !== 0;
    }
    if (this.a >= THRESHOLD[state]) {
      ctx[index] = MPS_NEXT[state];
    }
    this.bitCount -= 1;
    this.a = (clamped << 1) & 0xffff;
    this.c = ((this.c << 1) | ((this.bitBuf >>> (this.bitCount & 31)) & 1)) & 0xffff;
    if (this.bitCount < 16) {
      this.refill();
    }
    this.fence = Math.min(this.c, 0x7fff);
    return mps !== 0;
  }

  /** Декодирование одного бита без контекста (порог `0x8000 + a/2`). */
  decodePassthrough(): boolean {
    const z = 0x8000 + (this.a >> 1);
    if (z > this.c) {
      const complement = 0x10000 - z;
      this.a = (this.a + complement) & 0xffff;
      this.c = (this.c + complement) & 0xffff;
      this.renormalize();
      return true;
    }
    this.bitCount -= 1;
    this.a = (z * 2) & 0xffff;
    this.c = ((this.c << 1) | ((this.bitBuf >>> (this.bitCount & 31)) & 1)) & 0xffff;
    if (this.bitCount < 16) {
      this.refill();
    }
    this.fence = Math.min(this.c, 0x7fff);
    return false;
  }

  /** Нормализация интервала после события LPS. */
  private renormalize(): void {
    const shift = leadingOnes16(this.a);
    this.bitCount -= shift;
    this.a = (this.a << shift) & 0xffff;
    const mask = (1 << shift) - 1;
    this.c = ((this.c << shift) | ((this.bitBuf >>> (this.bitCount & 31)) & mask)) & 0xffff;
    if (this.bitCount < 16) {
      this.refill();
    }
    this.fence = Math.min(this.c, 0x7fff);
  }

  /** Число синтетических байт, прочитанных за концом данных. */
  get syntheticBytes(): number {
    return Math.max(0, this.pos - this.data.length);
  }
}

/** Декодирование `bitCount` «сырых» бит (без контекста). */
function decodeRawBits(zp: ZpDecoder, bitCount: number): number {
  const limit = 1 << bitCount;
  let value = 1;
  while (value < limit) {
    value = (value << 1) | (zp.decodePassthrough() ? 1 : 0);
  }
  return value - limit;
}

/** Декодирование значения из поддерева контекстов. */
function decodeCtxBits(zp: ZpDecoder, ctx: Uint8Array, base: number, bitCount: number): number {
  const subtree = base - 1;
  const limit = 1 << bitCount;
  let value = 1;
  while (value < limit) {
    const bit = zp.decodeBit(ctx, subtree + value) ? 1 : 0;
    value = (value << 1) | bit;
  }
  return value - limit;
}

/** Декодирование позиции MTF иерархией контекстов. */
function decodeMtfPosition(zp: ZpDecoder, ctx: Uint8Array, ctxId: number): number {
  let offset = 0;
  if (zp.decodeBit(ctx, offset + ctxId)) {
    return 0;
  }
  offset += LEVEL_CTXIDS;
  if (zp.decodeBit(ctx, offset + ctxId)) {
    return 1;
  }
  offset += LEVEL_CTXIDS;
  if (zp.decodeBit(ctx, offset)) {
    return 2 + decodeCtxBits(zp, ctx, offset + 1, 1);
  }
  offset += 2;
  if (zp.decodeBit(ctx, offset)) {
    return 4 + decodeCtxBits(zp, ctx, offset + 1, 2);
  }
  offset += 4;
  if (zp.decodeBit(ctx, offset)) {
    return 8 + decodeCtxBits(zp, ctx, offset + 1, 3);
  }
  offset += 8;
  if (zp.decodeBit(ctx, offset)) {
    return 16 + decodeCtxBits(zp, ctx, offset + 1, 4);
  }
  offset += 16;
  if (zp.decodeBit(ctx, offset)) {
    return 32 + decodeCtxBits(zp, ctx, offset + 1, 5);
  }
  offset += 32;
  if (zp.decodeBit(ctx, offset)) {
    return 64 + decodeCtxBits(zp, ctx, offset + 1, 6);
  }
  offset += 64;
  if (zp.decodeBit(ctx, offset)) {
    return 128 + decodeCtxBits(zp, ctx, offset + 1, 7);
  }
  return 256;
}

/** Обратное преобразование Бёрроуза — Уилера с маркером конца блока. */
function inverseBwt(bwtData: Uint8Array, markerPos: number): Uint8Array {
  const total = bwtData.length;
  if (total === 0) {
    return new Uint8Array(0);
  }
  const byteCount = new Uint32Array(256);
  const rank = new Uint32Array(total);
  for (let i = 0; i < total; i += 1) {
    if (i === markerPos) {
      continue;
    }
    const byteValue = bwtData[i];
    rank[i] = ((byteValue << 24) | (byteCount[byteValue] & 0x00ff_ffff)) >>> 0;
    byteCount[byteValue] += 1;
  }
  const sortedStart = new Uint32Array(256);
  let running = 1;
  for (let byteValue = 0; byteValue < 256; byteValue += 1) {
    sortedStart[byteValue] = running;
    running += byteCount[byteValue];
  }
  const outputLength = total - 1;
  const output = new Uint8Array(outputLength);
  let follow = 0;
  let remaining = outputLength;
  while (remaining > 0) {
    const encoded = rank[follow];
    const byteValue = encoded >>> 24;
    const occurrence = encoded & 0x00ff_ffff;
    remaining -= 1;
    output[remaining] = byteValue;
    follow = sortedStart[byteValue] + occurrence;
  }
  return output;
}

/** Декодирование одного блока BZZ. */
function decodeBlock(zp: ZpDecoder, ctx: Uint8Array, blockSize: number): Uint8Array {
  let freqShift = 0;
  if (zp.decodePassthrough()) {
    freqShift += 1;
    if (zp.decodePassthrough()) {
      freqShift += 1;
    }
  }
  const mtfOrder = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    mtfOrder[i] = i;
  }
  const freqCounts = new Uint32Array(FREQ_SLOTS);
  let freqAdd = 4;
  let lastMtfPos = 3;
  let markerPos = -1;
  const bwtData = new Uint8Array(blockSize);
  for (let symIndex = 0; symIndex < blockSize; symIndex += 1) {
    if (symIndex % SPIN_CHECK_INTERVAL === 0 && zp.syntheticBytes > EOF_SLACK) {
      throw new Error('BZZ: поток обрывается');
    }
    const ctxId = Math.min(lastMtfPos, LEVEL_CTXIDS - 1);
    const mtfPosition = decodeMtfPosition(zp, ctx, ctxId);
    lastMtfPos = mtfPosition;
    if (mtfPosition === 256) {
      bwtData[symIndex] = 0;
      markerPos = symIndex;
      continue;
    }
    const symbol = mtfOrder[mtfPosition];
    bwtData[symIndex] = symbol;
    freqAdd += freqAdd >> freqShift;
    if (freqAdd > 0x1000_0000) {
      freqAdd >>= 24;
      for (let i = 0; i < FREQ_SLOTS; i += 1) {
        freqCounts[i] >>= 24;
      }
    }
    let combinedFreq = freqAdd;
    if (mtfPosition < FREQ_SLOTS) {
      combinedFreq = Math.min(combinedFreq + freqCounts[mtfPosition], 0xffff_ffff);
    }
    let insertAt = mtfPosition;
    if (insertAt >= FREQ_SLOTS) {
      mtfOrder.copyWithin(FREQ_SLOTS, FREQ_SLOTS - 1, insertAt);
      insertAt = FREQ_SLOTS - 1;
    }
    while (insertAt > 0) {
      const prevFreq = freqCounts[insertAt - 1];
      if (combinedFreq >= prevFreq) {
        mtfOrder[insertAt] = mtfOrder[insertAt - 1];
        freqCounts[insertAt] = prevFreq;
        insertAt -= 1;
      } else {
        break;
      }
    }
    mtfOrder[insertAt] = symbol;
    freqCounts[insertAt] = combinedFreq;
  }
  if (markerPos < 0) {
    throw new Error('BZZ: в блоке нет маркера');
  }
  return inverseBwt(bwtData, markerPos);
}

/** Декодирование потока BZZ. */
export function bzzDecode(data: Uint8Array): Uint8Array {
  const zp = new ZpDecoder(data);
  const ctx = new Uint8Array(CTX_COUNT);
  const blocks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const blockSize = decodeRawBits(zp, 24);
    if (blockSize === 0) {
      break;
    }
    if (blockSize > MAX_BLOCK_SIZE) {
      throw new Error('BZZ: слишком большой блок');
    }
    const block = decodeBlock(zp, ctx, blockSize);
    total += block.length;
    if (total > MAX_OUTPUT_SIZE) {
      throw new Error('BZZ: слишком большой вывод');
    }
    blocks.push(block);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}
