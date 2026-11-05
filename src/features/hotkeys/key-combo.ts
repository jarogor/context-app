/** Комбинация клавиш: нормализованное представление, разбор и сравнение.
 *
 * Модуль чист от Svelte и от состояния приложения: одна комбинация описывается
 * объектом, который одинаково строится из текста (`'Ctrl+Shift+F'`) и из события
 * клавиатуры.
 *
 * Клавиша описывается **физическим кодом** (`event.code`), а не символом
 * (`event.key`): при русской раскладке `Ctrl+F` давал бы символ «а», и команда
 * не срабатывала бы. Код не зависит ни от раскладки, ни от регистра, поэтому
 * одно действие одинаково доступно на любой раскладке. Символ нужен только для
 * показа: `KeyF` показывается как `F`, `Digit1` — как `1`.
 */

import { t } from '@context/i18n';

/** Описание комбинации: клавиша и зажатые модификаторы. */
export interface KeyCombo {
  /** Физический код клавиши: `KeyF`, `Digit1`, `PageDown`, `Escape`. */
  code: string;
  /** Зажат ли Ctrl. */
  ctrl: boolean;
  /** Зажат ли Alt. */
  alt: boolean;
  /** Зажат ли Shift. */
  shift: boolean;
  /** Зажат ли Meta (Windows/Linux) — отдельный модификатор. */
  meta: boolean;
}

/** Имена клавиш, которые в записи комбинации можно писать по-разному. */
const KEY_ALIASES: Record<string, string> = {
  escape: 'Escape',
  esc: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  space: 'Space',
  spacebar: 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  plus: 'Equal',
  equal: 'Equal',
  minus: 'Minus',
  comma: 'Comma',
  period: 'Period',
  dot: 'Period',
  slash: 'Slash',
  backslash: 'Backslash',
  semicolon: 'Semicolon',
  quote: 'Quote',
  apostrophe: 'Quote',
  bracketleft: 'BracketLeft',
  bracketright: 'BracketRight',
  backquote: 'Backquote',
  grave: 'Backquote',
  numpadadd: 'NumpadAdd',
  numpadsubtract: 'NumpadSubtract',
};

/** Физические коды клавиш, которые остаются как есть. */
const PHYSICAL_CODES = new Set([
  'Escape',
  'Enter',
  'Tab',
  'Space',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Backspace',
  'Delete',
  'Insert',
  'Equal',
  'Minus',
  'Comma',
  'Period',
  'Slash',
  'Backslash',
  'Semicolon',
  'Quote',
  'BracketLeft',
  'BracketRight',
  'Backquote',
  'NumpadAdd',
  'NumpadSubtract',
]);

/** Приведение записи клавиши к физическому коду.
 *
 * `'F'` → `KeyF`, `'1'` → `Digit1`, `'F3'` остаётся `F3`, `'Comma'` остаётся
 * `Comma`. Уже готовый код (`KeyF`, `Digit1`) принимается как есть.
 */
export function normalizeKeyName(value: string): string {
  const text = value.trim();
  if (text.length === 0) {
    throw new Error('пустое имя клавиши комбинации');
  }
  if (/^Key[A-Z]$/i.test(text)) {
    return `Key${text.slice(-1).toUpperCase()}`;
  }
  if (/^Digit[0-9]$/i.test(text)) {
    return `Digit${text.slice(-1)}`;
  }
  if (text.length === 1) {
    if (/[a-z]/i.test(text)) {
      return `Key${text.toUpperCase()}`;
    }
    if (/[0-9]/.test(text)) {
      return `Digit${text}`;
    }
    const symbol = SYMBOL_CODES[text];
    if (symbol) {
      return symbol;
    }
    throw new Error(`неизвестная клавиша комбинации: ${text}`);
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(text)) {
    return text.toUpperCase();
  }
  const alias = KEY_ALIASES[text.toLowerCase()];
  if (alias) {
    return alias;
  }
  if (PHYSICAL_CODES.has(text)) {
    return text;
  }
  throw new Error(`неизвестная клавиша комбинации: ${text}`);
}

/** Символы, которые можно записать как есть, и их физические коды. */
const SYMBOL_CODES: Record<string, string> = {
  '=': 'Equal',
  '-': 'Minus',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '`': 'Backquote',
  ' ': 'Space',
};

/** Разбор текстовой записи комбинации (`'Ctrl+Shift+F'`).
 *
 * Модификаторы можно писать в любом порядке и регистре: `Ctrl`, `Control`,
 * `Alt`, `Option`, `Shift`, `Meta`, `Cmd`, `Command`, `Win`. Последний сегмент —
 * клавиша. Некорректная запись — исключение: список привязок — это код, а не
 * пользовательский ввод, и ошибка в нём должна быть видна сразу.
 */
export function parseCombo(text: string): KeyCombo {
  const segments = text
    .split('+')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error(`пустая комбинация клавиш: ${JSON.stringify(text)}`);
  }
  const combo: KeyCombo = { code: '', ctrl: false, alt: false, shift: false, meta: false };
  for (const segment of segments.slice(0, -1)) {
    switch (segment.toLowerCase()) {
      case 'ctrl':
      case 'control':
        combo.ctrl = true;
        break;
      case 'alt':
      case 'option':
        combo.alt = true;
        break;
      case 'shift':
        combo.shift = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
      case 'win':
        combo.meta = true;
        break;
      default:
        throw new Error(`неизвестный модификатор комбинации клавиш: ${segment}`);
    }
  }
  combo.code = normalizeKeyName(segments[segments.length - 1]);
  return combo;
}

/** Канонический идентификатор комбинации для сравнения и хранения привязок. */
export function comboId(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) {
    parts.push('Ctrl');
  }
  if (combo.alt) {
    parts.push('Alt');
  }
  if (combo.shift) {
    parts.push('Shift');
  }
  if (combo.meta) {
    parts.push('Meta');
  }
  parts.push(combo.code);
  return parts.join('+');
}

/** Событие клавиатуры в объёме, нужном комбинации. */
export interface KeyEventLike {
  /** Символ нажатой клавиши (зависит от раскладки). */
  key: string;
  /** Физический код клавиши (не зависит от раскладки). */
  code?: string;
  /** Зажат ли Ctrl. */
  ctrlKey: boolean;
  /** Зажат ли Alt. */
  altKey: boolean;
  /** Зажат ли Shift. */
  shiftKey: boolean;
  /** Зажат ли Meta. */
  metaKey: boolean;
}

/** Код события: физический, а при его отсутствии — по символу.
 *
 * Настоящие события браузера всегда несут `code`; запасной путь нужен
 * синтетическим событиям (тесты, программный вызов), где заполняют только `key`.
 */
export function eventKeyCode(event: Pick<KeyEventLike, 'key' | 'code'>): string {
  const code = (event.code ?? '').trim();
  if (code) {
    return code;
  }
  try {
    return normalizeKeyName(event.key);
  } catch {
    return event.key;
  }
}

/** Комбинация события клавиатуры. */
export function comboOfEvent(event: KeyEventLike): KeyCombo {
  return {
    code: eventKeyCode(event),
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

/** Показ комбинации: модификаторы, затем клавиша. */
export function formatCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) {
    parts.push('Ctrl');
  }
  if (combo.alt) {
    parts.push('Alt');
  }
  if (combo.shift) {
    parts.push('Shift');
  }
  if (combo.meta) {
    parts.push('Meta');
  }
  parts.push(displayKey(combo.code));
  return parts.join('+');
}

/** Человекочитаемое имя клавиши для показа. */
function displayKey(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    return letter[1];
  }
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) {
    return digit[1];
  }
  switch (code) {
    case 'Space':
      return t('app.hotkey.space');
    case 'Equal':
      return '=';
    case 'Minus':
      return '-';
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Slash':
      return '/';
    case 'Backslash':
      return '\\';
    case 'Semicolon':
      return ';';
    case 'Quote':
      return "'";
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Backquote':
      return '`';
    case 'NumpadAdd':
      return 'Numpad +';
    case 'NumpadSubtract':
      return 'Numpad -';
    case 'PageUp':
      return 'Page Up';
    case 'PageDown':
      return 'Page Down';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    default:
      return code;
  }
}

/** Описание привязки, которое передаётся в модуль рисования книги.
 *
 * Модуль живёт в песочнице и не видит реестр приложения, а значит не может
 * сравнить комбинации сам. Вместо разбора он получает готовые описания и
 * сравнивает поля события с ними: так единственным источником нормализации
 * остаётся приложение, и в модуле нет второй копии правил.
 */
export interface ComboDescriptor {
  /** Идентификатор действия. */
  id: string;
  /** Физический код клавиши (`KeyboardEvent.code`). */
  code: string;
  /** Зажат ли Ctrl. */
  ctrl: boolean;
  /** Зажат ли Alt. */
  alt: boolean;
  /** Зажат ли Shift. */
  shift: boolean;
  /** Зажат ли Meta. */
  meta: boolean;
}

/** Клавиши, которые браузер прокручивает сам. */
const NATIVE_SCROLL_CODES = new Set(['PageUp', 'PageDown', 'Home', 'End', 'Space']);

/** Нажатие — «голая» прокруточная клавиша (без модификатора команды).
 *
 * Такие клавиши прокручивают то, что в фокусе: документ, список, панель. Книга
 * не должна перехватывать их, когда пользователь листает список заметок или
 * библиотеку, поэтому приложение уступает их браузеру вне области чтения.
 */
export function isNativeScrollCombo(combo: KeyCombo): boolean {
  return (
    NATIVE_SCROLL_CODES.has(combo.code) && !combo.ctrl && !combo.alt && !combo.meta && !combo.shift
  );
}

/** Проверка, что событие пришло из поля ввода текста.
 *
 * Проверяются поля ввода, `textarea`, `select` и редактируемые области. Цели
 * события может не быть (нажатие на `window`), и это не поле ввода.
 */
export function isTextInputTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') {
    return false;
  }
  const editable = element.getAttribute('contenteditable');
  if (element.isContentEditable || (editable !== null && editable !== 'false')) {
    return true;
  }
  return /^(input|textarea|select)$/i.test(element.tagName);
}

/** Нажатие пришло из области, которая прокручивается сама (список, панель).
 *
 * Прокруточная клавиша в такой области принадлежит ей, а не книге: иначе
 * `PageDown` в списке заметок листал бы книгу, которую пользователь не видит.
 */
export function isOwnScrollTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== 'function') {
    return false;
  }
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) {
      return false;
    }
    const overflow = typeof getComputedStyle === 'function' ? getComputedStyle(node).overflowY : '';
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
      return true;
    }
  }
  return false;
}

/** Описание привязки для модуля рисования книги. */
export function comboDescriptor(id: string, combo: KeyCombo): ComboDescriptor {
  return {
    id,
    code: combo.code,
    ctrl: combo.ctrl,
    alt: combo.alt,
    shift: combo.shift,
    meta: combo.meta,
  };
}
