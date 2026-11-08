import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Icon, { TAB_ICON_NAMES } from './Icon.svelte';

describe('Icon', () => {
  it('рисует svg и скрывает иконку от скринридеров', () => {
    const { container } = render(Icon, { props: { name: 'calendar' } });

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('поддерживает разные иконки', () => {
    const { container } = render(Icon, { props: { name: 'search' } });

    expect(container.querySelector('circle')).toBeTruthy();
  });

  it('рисует каждую иконку набора вкладок непустой', () => {
    for (const name of TAB_ICON_NAMES) {
      const { container } = render(Icon, { props: { name } });

      const svg = container.querySelector('svg');
      expect(svg, name).toBeTruthy();
      expect(svg?.childElementCount, name).toBeGreaterThan(0);
    }
  });

  it('рисует иконки действий и разделов непустыми', () => {
    const names = [
      'gear',
      'plus',
      'chevron-left',
      'chevron-right',
      'chevrons-left',
      'chevrons-right',
      'chevron-down',
      'copy',
      'resize',
      'move',
      'pencil',
      'bell',
      'workspace',
      'library',
      'list',
      'tabs',
      'grid',
      'focus',
      'trash',
      'duplicate',
      'more',
      'monitor',
    ] as const;

    for (const name of names) {
      const { container } = render(Icon, { props: { name } });

      const svg = container.querySelector('svg');
      expect(svg, name).toBeTruthy();
      expect(svg?.childElementCount, name).toBeGreaterThan(0);
    }
  });
});
