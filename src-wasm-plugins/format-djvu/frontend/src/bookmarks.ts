/** Встроенное оглавление DjVu: разбор чанка `NAVM`.
 *
 * Оглавление DjVu — дерево закладок с названием и ссылкой перехода, сжатое BZZ.
 * После распаковки оно состоит из общего числа узлов (`u16`, старший байт
 * первым) и узлов: число детей (`u8`), название, ссылка, затем дети. Строки —
 * длина (`u24`) и байты UTF-8.
 *
 * Ссылка ведёт на страницу либо на якорь вида `#page=25`; в составных книгах
 * после `#` стоит имя файла страницы (`#p0002.djvu`), а в книгах с якорями —
 * номер по порядку.
 */
import { bzzDecode } from './bzz';
import type { ViewerBookmark } from './types';

/** Предел числа узлов оглавления, которые разбираются. */
const BOOKMARK_LIMIT = 5000;

/** Предел вложенности узлов: защита от повреждённого файла. */
const DEPTH_LIMIT = 32;

/** Чтение трёхбайтовой длины от старшего байта. */
function readU24(data: Uint8Array, offset: number): number {
  return (data[offset] * 0x10000) + (data[offset + 1] << 8) + data[offset + 2];
}

/** Чтение строки с длиной и байтами UTF-8. */
function readString(
  data: Uint8Array,
  state: { offset: number },
): string | null {
  if (state.offset + 3 > data.length) {
    return null;
  }
  const length = readU24(data, state.offset);
  state.offset += 3;
  if (length === 0) {
    return '';
  }
  if (state.offset + length > data.length) {
    return null;
  }
  const bytes = data.slice(state.offset, state.offset + length);
  state.offset += length;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Имена в старых книгах бывают в однобайтовой кодировке: показываем
    // их читаемо, а не теряем пункт оглавления целиком.
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

/** Номер страницы из ссылки пункта оглавления.
 *
 * Поддерживаются три вида ссылок: `#page=N` и `#N` — номер по порядку,
 * `#имя.djvu` — имя страницы составной книги. Имя разрешает вызывающая сторона
 * по каталогу компонентов, если оно ей известно.
 */
export function pageFromUrl(url: string): { page: number | null; name: string | null } {
  const value = String(url ?? '').trim();
  if (!value) {
    return { page: null, name: null };
  }
  const hash = value.startsWith('#') ? value.slice(1) : value;
  const pageMatch = /^page=(\d+)$/i.exec(hash);
  if (pageMatch) {
    return { page: Number(pageMatch[1]), name: null };
  }
  if (/^\d+$/.test(hash)) {
    return { page: Number(hash), name: null };
  }
  return { page: null, name: hash };
}

/** Разбор распакованного оглавления DjVu. */
export function parseNavm(decoded: Uint8Array): ViewerBookmark[] {
  if (decoded.length < 2) {
    return [];
  }
  const total = (decoded[0] << 8) | decoded[1];
  if (total === 0) {
    return [];
  }
  const state = { offset: 2 };
  let parsed = 0;

  /** Разбор узла и его детей. */
  function node(depth: number): ViewerBookmark | null {
    if (
      parsed >= total ||
      parsed >= BOOKMARK_LIMIT ||
      depth > DEPTH_LIMIT ||
      state.offset >= decoded.length
    ) {
      return null;
    }
    const childrenCount = decoded[state.offset];
    state.offset += 1;
    const title = readString(decoded, state);
    const url = readString(decoded, state);
    if (title === null || url === null) {
      return null;
    }
    parsed += 1;
    const target = pageFromUrl(url);
    const children: ViewerBookmark[] = [];
    for (let index = 0; index < childrenCount; index += 1) {
      const child = node(depth + 1);
      if (child) {
        children.push(child);
      }
    }
    const label = title.trim();
    if (!label && target.page === null && !target.name && children.length === 0) {
      return null;
    }
    return {
      title: label,
      page: target.page,
      name: target.name,
      children,
    };
  }

  const result: ViewerBookmark[] = [];
  while (parsed < total) {
    const next = node(0);
    if (!next) {
      break;
    }
    result.push(next);
  }
  return result;
}

/** Разбор оглавления `NAVM` с распаковкой BZZ. */
export function readNavm(payload: Uint8Array): ViewerBookmark[] {
  try {
    return parseNavm(bzzDecode(payload));
  } catch {
    return [];
  }
}

/** Поиск чанка `NAVM` в байтах книги и разбор оглавления.
 *
 * Оглавление составной книги лежит в её форме `DJVM`; у одиночного файла —
 * в форме `DJVU`. Чанк ищется по метке: полный разбор контейнера уже есть в
 * `djvm`, но оглавление читается и без него.
 */
export function readBookmarksFromBytes(bytes: Uint8Array): ViewerBookmark[] {
  const at = indexOf(bytes, 'NAVM');
  if (at < 0 || at + 8 > bytes.length) {
    return [];
  }
  const size =
    (bytes[at + 4] * 0x1000000) +
    (bytes[at + 5] << 16) +
    (bytes[at + 6] << 8) +
    bytes[at + 7];
  if (size <= 0 || at + 8 + size > bytes.length) {
    return [];
  }
  return readNavm(bytes.slice(at + 8, at + 8 + size));
}

/** Позиция подстроки ASCII в байтах. */
function indexOf(bytes: Uint8Array, text: string): number {
  const first = text.charCodeAt(0);
  for (let index = 0; index + text.length <= bytes.length; index += 1) {
    if (bytes[index] !== first) {
      continue;
    }
    let match = true;
    for (let offset = 1; offset < text.length; offset += 1) {
      if (bytes[index + offset] !== text.charCodeAt(offset)) {
        match = false;
        break;
      }
    }
    if (match) {
      return index;
    }
  }
  return -1;
}
