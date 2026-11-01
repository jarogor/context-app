//! Каталог разрешённого декларативного интерфейса.
//!
//! Каталог — часть контракта `ui-schema`: он перечисляет компоненты дизайн-
//! системы, их разрешённые свойства и события, а также пространства интерфейса
//! (точки расширения) и допустимые в них компоненты. Плагин вносит узлы только
//! в объявленное пространство и только разрешёнными компонентами. Хост
//! опирается на этот же каталог при рендере и валидации: недопустимый узел
//! отклоняется с диагностикой, не влияя на остальной интерфейс.

import { t } from '@context/i18n';
import type { UiComponentSpec, UiElement, UiNode, UiSpaceDeclaration, UiSpaceSpec } from './index';
import { isUiText } from './index';

/** Разрешённые компоненты декларативного интерфейса. */
export const UI_COMPONENTS: Record<string, UiComponentSpec> = {
  Card: { name: 'Card', props: [], events: [], children: true },
  Heading: { name: 'Heading', props: ['text', 'level'], events: [], children: false },
  Text: { name: 'Text', props: ['text'], events: [], children: false },
  Checkbox: {
    name: 'Checkbox',
    props: ['name', 'label', 'checked', 'description'],
    events: ['change'],
    children: false,
  },
  Input: {
    name: 'Input',
    props: ['name', 'label', 'type', 'value', 'description'],
    events: ['input'],
    children: false,
  },
  Textarea: {
    name: 'Textarea',
    props: ['name', 'label', 'value', 'description'],
    events: ['input'],
    children: false,
  },
  Select: {
    name: 'Select',
    props: ['name', 'label', 'value', 'options', 'description'],
    events: ['change'],
    children: false,
  },
  Button: {
    name: 'Button',
    props: ['label', 'variant', 'disabled'],
    events: ['click'],
    children: false,
  },
};

/** Пространства интерфейса: точки расширения со стабильными идентификаторами. */
export const UI_SPACES: Record<string, UiSpaceSpec> = {
  'settings.section': {
    id: 'settings.section',
    get title() {
      return t('app.settings.title');
    },
    components: ['Card', 'Heading', 'Text', 'Checkbox', 'Input', 'Textarea', 'Select', 'Button'],
  },
};

/** Описание компонента по имени или `undefined`, если компонент не разрешён. */
export function componentSpec(name: string): UiComponentSpec | undefined {
  return UI_COMPONENTS[name];
}

/** Описание пространства по идентификатору или `undefined`. */
export function spaceSpec(id: string): UiSpaceSpec | undefined {
  return UI_SPACES[id];
}

/** Результат проверки декларации: очищенная декларация и диагностика. */
export interface UiSanitizedDeclaration {
  /** Декларация без недопустимых узлов или `null`, если пространство не объявлено. */
  declaration: UiSpaceDeclaration | null;
  /** Диагностика отклонённых элементов. */
  diagnostics: string[];
}

/** Проверка и очистка дерева узлов от недопустимых элементов. */
function sanitizeNodes(
  nodes: UiNode[],
  space: UiSpaceSpec,
  diagnostics: string[],
): UiNode[] {
  const result: UiNode[] = [];
  for (const node of nodes) {
    const sanitized = sanitizeNode(node, space, diagnostics);
    if (sanitized) {
      result.push(sanitized);
    }
  }
  return result;
}

/** Проверка и очистка одного узла; `null` означает отклонение узла. */
function sanitizeNode(
  node: UiNode,
  space: UiSpaceSpec,
  diagnostics: string[],
): UiNode | null {
  if (isUiText(node)) {
    return { type: '#text', value: String(node.value ?? '') };
  }
  const spec = componentSpec(node.type);
  if (!spec) {
    diagnostics.push(t('app.settings.moduleNotAllowed', { type: node.type }));
    return null;
  }
  if (!space.components.includes(node.type)) {
    diagnostics.push(t('app.settings.moduleNotInSpace', { space: space.id, type: node.type }));
    return null;
  }
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node.props ?? {})) {
    if (spec.props.includes(name)) {
      props[name] = value;
    } else {
      diagnostics.push(t('app.settings.propNotAllowed', { type: node.type, name }));
    }
  }
  const on: Record<string, string> = {};
  for (const [event, action] of Object.entries(node.on ?? {})) {
    if (!spec.events.includes(event)) {
      diagnostics.push(t('app.settings.eventNotAllowed', { type: node.type, event }));
    } else if (typeof action !== 'string') {
      diagnostics.push(t('app.settings.actionMustBeString', { type: node.type, event }));
    } else {
      on[event] = action;
    }
  }
  const children: UiNode[] = [];
  const rawChildren = node.children ?? [];
  if (rawChildren.length > 0 && !spec.children) {
    diagnostics.push(t('app.settings.noChildren', { type: node.type }));
  } else {
    children.push(...sanitizeNodes(rawChildren, space, diagnostics));
  }
  const element: UiElement = { type: node.type };
  if (Object.keys(props).length > 0) {
    element.props = props;
  }
  if (Object.keys(on).length > 0) {
    element.on = on;
  }
  if (children.length > 0) {
    element.children = children;
  }
  return element;
}

/** Проверка декларации пространства и отклонение недопустимых узлов. */
export function sanitizeDeclaration(declaration: UiSpaceDeclaration): UiSanitizedDeclaration {
  const diagnostics: string[] = [];
  const space = spaceSpec(declaration.space);
  if (!space) {
    diagnostics.push(t('app.settings.spaceNotDeclared', { space: declaration.space }));
    return { declaration: null, diagnostics };
  }
  const nodes = sanitizeNodes(declaration.nodes ?? [], space, diagnostics);
  return { declaration: { ...declaration, nodes }, diagnostics };
}
