/** Разбор и починка контейнера DjVu `DJVM` с общими словарями.
 *
 * В составном DjVu страницы могут не нести собственную JB2-маску, а ссылаться
 * на общую символьную форму через чанк `INCL`. Движок чтения сопоставляет такое
 * включение с компонентом каталога по имени и принимает только имена в UTF-8:
 * имя, записанное в однобайтовой кодировке, он молча игнорирует, и страница
 * рисуется пустой (в ней нет ни маски, ни своего словаря).
 *
 * Обход не трогает движок: перед разбором документа странице встраивается её
 * словарь — содержимое общего компонента `DJVI` переносится в страницу как
 * собственный чанк `Djbz`. Каталог при этом сохраняется без изменений, кроме
 * смещений компонентов.
 */
import { bzzDecode } from './bzz';

/** Символы ASCII-строки в виде массива байт. */
function ascii(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    out.push(text.charCodeAt(i));
  }
  return out;
}

/** Сравнение фрагмента байт с ASCII-строкой. */
function matchesAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) {
    return false;
  }
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

/** Чтение 32-битного числа от старшего байта. */
function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

/** Чанк IFF: идентификатор и данные. */
interface Chunk {
  /** Четырёхбайтовый идентификатор. */
  id: string;
  /** Полезная нагрузка чанка. */
  data: Uint8Array;
}

/** Компонент каталога: тип формы и её чанки. */
interface Component {
  /** Абсолютное смещение тега `FORM` в исходных байтах. */
  offset: number;
  /** Тип формы (`DJVU`, `DJVI`, `THUM`, …). */
  type: string;
  /** Чанки формы. */
  chunks: Chunk[];
}

/** Описание компонента из метаданных каталога. */
interface DirectoryEntry {
  /** Вид компонента из младших шести бит флагов. */
  kind: number;
  /** Идентификатор (имя) компонента в исходной кодировке. */
  id: Uint8Array;
}

/** Разбор чанков формы, начиная с её полезной нагрузки. */
function parseChunks(bytes: Uint8Array, start: number, end: number): Chunk[] {
  const chunks: Chunk[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    if (!/^[A-Za-z0-9]{4}$/.test(id)) {
      break;
    }
    const size = readU32(bytes, pos + 4);
    if (pos + 8 + size > end) {
      break;
    }
    chunks.push({ id, data: bytes.slice(pos + 8, pos + 8 + size) });
    pos += 8 + size;
    if (pos % 2 === 1) {
      pos += 1;
    }
  }
  return chunks;
}

/** Разбор компонента по абсолютному смещению тега `FORM`. */
function parseComponent(bytes: Uint8Array, offset: number): Component | null {
  if (!matchesAscii(bytes, offset, 'FORM') || offset + 12 > bytes.length) {
    return null;
  }
  const size = readU32(bytes, offset + 4);
  const end = offset + 8 + size;
  if (end > bytes.length) {
    return null;
  }
  const type = String.fromCharCode(
    bytes[offset + 8],
    bytes[offset + 9],
    bytes[offset + 10],
    bytes[offset + 11],
  );
  return { offset, type, chunks: parseChunks(bytes, offset + 12, end) };
}

/** Декодирование метаданных каталога: вид и идентификатор каждого компонента. */
function parseDirectory(nfiles: number, meta: Uint8Array): DirectoryEntry[] | null {
  let decoded: Uint8Array;
  try {
    decoded = bzzDecode(meta);
  } catch {
    return null;
  }
  const flagsStart = nfiles * 3;
  if (flagsStart + nfiles > decoded.length) {
    return null;
  }
  const entries: DirectoryEntry[] = [];
  let pos = flagsStart + nfiles;
  for (let index = 0; index < nfiles; index += 1) {
    const kind = decoded[flagsStart + index] & 0x3f;
    const idEnd = decoded.indexOf(0, pos);
    if (idEnd < 0) {
      return null;
    }
    const id = decoded.slice(pos, idEnd);
    pos = idEnd + 1;
    const flag = decoded[flagsStart + index];
    if ((flag & 0x80) !== 0) {
      const nameEnd = decoded.indexOf(0, pos);
      if (nameEnd < 0) {
        return null;
      }
      pos = nameEnd + 1;
    }
    if ((flag & 0x40) !== 0) {
      const titleEnd = decoded.indexOf(0, pos);
      if (titleEnd < 0) {
        return null;
      }
      pos = titleEnd + 1;
    }
    entries.push({ kind, id });
  }
  return entries;
}

/** Ключ сравнения имён: байты без хвостовых нулей и пробелов. */
function nameKey(name: Uint8Array): string {
  let end = name.length;
  while (end > 0 && (name[end - 1] === 0 || name[end - 1] === 0x20 || name[end - 1] === 0x09)) {
    end -= 1;
  }
  let out = '';
  for (let i = 0; i < end; i += 1) {
    out += name[i].toString(16).padStart(2, '0');
  }
  return out;
}

/** Декодирование имени как UTF-8; `null`, если байты не являются UTF-8. */
function decodeUtf8(name: Uint8Array): string | null {
  let end = name.length;
  while (end > 0 && (name[end - 1] === 0 || name[end - 1] === 0x20 || name[end - 1] === 0x09)) {
    end -= 1;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(name.subarray(0, end));
  } catch {
    return null;
  }
}

/** Сборка чанка IFF с выравниванием до чётной длины. */
function buildChunk(id: string, data: Uint8Array): Uint8Array {
  const padded = data.length % 2 === 0;
  const out = new Uint8Array(8 + data.length + (padded ? 0 : 1));
  out.set(ascii(id), 0);
  out[4] = (data.length >>> 24) & 0xff;
  out[5] = (data.length >>> 16) & 0xff;
  out[6] = (data.length >>> 8) & 0xff;
  out[7] = data.length & 0xff;
  out.set(data, 8);
  return out;
}

/** Сборка формы `FORM` из типа и чанков. */
function buildForm(type: string, chunks: Chunk[]): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array(ascii(type))];
  for (const chunk of chunks) {
    parts.push(buildChunk(chunk.id, chunk.data));
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(8 + total);
  out.set(ascii('FORM'), 0);
  out[4] = (total >>> 24) & 0xff;
  out[5] = (total >>> 16) & 0xff;
  out[6] = (total >>> 8) & 0xff;
  out[7] = total & 0xff;
  let offset = 8;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Склейка фрагментов в один массив. */
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Определение словаря страницы по её включениям.
 *
 * Сначала проверяется, что словарь найдёт сам движок чтения: он сопоставляет
 * имя включения `INCL` с идентификатором общего компонента как строку UTF-8.
 * Если это так, страница не трогается. Иначе — например, когда имя или
 * идентификатор записаны в однобайтовой кодировке — словарь подбирается
 * побайтово: имя и идентификатор в файле суть одна и та же строка.
 * Возвращается содержимое `Djbz` первого подходящего общего компонента
 * (политика движка чтения).
 */
function dictionaryFor(
  chunks: Chunk[],
  dictionaries: Map<string, Uint8Array>,
  utf8Dictionaries: Map<string, Uint8Array>,
): Uint8Array | null {
  if (chunks.some((chunk) => chunk.id === 'Djbz')) {
    return null;
  }
  const includes = chunks.filter((chunk) => chunk.id === 'INCL');
  for (const chunk of includes) {
    const text = decodeUtf8(chunk.data);
    if (text !== null && utf8Dictionaries.has(text)) {
      return null;
    }
  }
  for (const chunk of includes) {
    const dict = dictionaries.get(nameKey(chunk.data));
    if (dict) {
      return dict;
    }
  }
  return null;
}

/** Предельный объём словарей, встраиваемых в страницы (64 МиБ).
 *
 * Встраивание дублирует словарь в каждой странице, которая на него ссылается,
 * поэтому для книги с очень большими общими словарями починка пропускается:
 * иначе разбор требовал бы несоразмерно много памяти.
 */
const MAX_DICTIONARY_BYTES = 64 * 1024 * 1024;

/** Встраивание общих словарей `DJVU`-страниц в сами страницы.
 *
 * Если документ не является составным `DJVM`, не содержит общих словарей или
 * страниц без собственной маски — байты возвращаются без изменений.
 */
export function normalizeSharedDictionaries(bytes: Uint8Array): Uint8Array {
  if (
    !matchesAscii(bytes, 0, 'AT&T') ||
    !matchesAscii(bytes, 4, 'FORM') ||
    !matchesAscii(bytes, 12, 'DJVM') ||
    !matchesAscii(bytes, 16, 'DIRM')
  ) {
    return bytes;
  }
  const dirSize = readU32(bytes, 20);
  const dirStart = 24;
  const flags = bytes[dirStart];
  if ((flags & 0x80) === 0) {
    return bytes;
  }
  const nfiles = (bytes[dirStart + 1] << 8) | bytes[dirStart + 2];
  const dirEnd = dirStart + dirSize;
  if (dirEnd > bytes.length || nfiles === 0) {
    return bytes;
  }
  const offsets: number[] = [];
  for (let index = 0; index < nfiles; index += 1) {
    offsets.push(readU32(bytes, dirStart + 3 + index * 4));
  }
  const metadata = bytes.slice(dirStart + 3 + nfiles * 4, dirEnd);
  const entries = parseDirectory(nfiles, metadata);
  if (!entries) {
    return bytes;
  }
  const components: Component[] = [];
  for (let index = 0; index < nfiles; index += 1) {
    const component = parseComponent(bytes, offsets[index]);
    if (!component) {
      return bytes;
    }
    components.push(component);
  }
  const dictionaries = new Map<string, Uint8Array>();
  const utf8Dictionaries = new Map<string, Uint8Array>();
  for (let index = 0; index < nfiles; index += 1) {
    const entry = entries[index];
    if (entry.kind === 1 || entry.kind === 2) {
      continue;
    }
    const djbz = components[index].chunks.find((chunk) => chunk.id === 'Djbz');
    if (djbz) {
      dictionaries.set(nameKey(entry.id), djbz.data);
      const text = decodeUtf8(entry.id);
      if (text !== null) {
        utf8Dictionaries.set(text, djbz.data);
      }
    }
  }
  if (dictionaries.size === 0) {
    return bytes;
  }
  const replacements = new Map<number, Uint8Array>();
  let copied = 0;
  for (let index = 0; index < nfiles; index += 1) {
    if (entries[index].kind !== 1 || components[index].type !== 'DJVU') {
      continue;
    }
    const dictionary = dictionaryFor(components[index].chunks, dictionaries, utf8Dictionaries);
    if (!dictionary) {
      continue;
    }
    copied += dictionary.length;
    if (copied > MAX_DICTIONARY_BYTES) {
      return bytes;
    }
    const chunks = [...components[index].chunks, { id: 'Djbz', data: dictionary }];
    replacements.set(components[index].offset, buildForm('DJVU', chunks));
  }
  if (replacements.size === 0) {
    return bytes;
  }
  // Тело DJVM: чанки после DIRM. Компоненты заменяются, прочие чанки
  // переносятся без изменений; смещения пересчитываются.
  const formEnd = 12 + readU32(bytes, 8);
  const body: Uint8Array[] = [];
  const newOffsets = new Map<number, number>();
  let pos = dirEnd;
  if (pos % 2 === 1) {
    pos += 1;
  }
  let cursor = 16 + 8 + dirSize;
  if (cursor % 2 === 1) {
    cursor += 1;
  }
  while (pos + 8 <= formEnd) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    if (!/^[A-Za-z0-9]{4}$/.test(id)) {
      break;
    }
    const size = readU32(bytes, pos + 4);
    const chunkEnd = pos + 8 + size;
    if (chunkEnd > bytes.length) {
      return bytes;
    }
    const replacement = id === 'FORM' ? replacements.get(pos) : undefined;
    const chunkBytes = replacement ?? bytes.slice(pos, chunkEnd + (chunkEnd % 2));
    if (id === 'FORM') {
      newOffsets.set(pos, cursor);
    }
    body.push(chunkBytes);
    cursor += chunkBytes.length;
    if (cursor % 2 === 1) {
      cursor += 1;
    }
    pos = chunkEnd;
    if (pos % 2 === 1) {
      pos += 1;
    }
  }
  if (newOffsets.size !== nfiles) {
    return bytes;
  }
  const dirData = bytes.slice(dirStart, dirEnd).slice();
  for (let index = 0; index < nfiles; index += 1) {
    const offset = newOffsets.get(offsets[index]);
    if (offset === undefined) {
      return bytes;
    }
    const at = 3 + index * 4;
    dirData[at] = (offset >>> 24) & 0xff;
    dirData[at + 1] = (offset >>> 16) & 0xff;
    dirData[at + 2] = (offset >>> 8) & 0xff;
    dirData[at + 3] = offset & 0xff;
  }
  const dirmChunk = buildChunk('DIRM', dirData);
  const payload = concat([new Uint8Array(ascii('DJVM')), dirmChunk, ...body]);
  const formSize = payload.length;
  const form = new Uint8Array(8 + payload.length);
  form.set(ascii('FORM'), 0);
  form[4] = (formSize >>> 24) & 0xff;
  form[5] = (formSize >>> 16) & 0xff;
  form[6] = (formSize >>> 8) & 0xff;
  form[7] = formSize & 0xff;
  form.set(payload, 8);
  return concat([new Uint8Array(ascii('AT&T')), form]);
}
