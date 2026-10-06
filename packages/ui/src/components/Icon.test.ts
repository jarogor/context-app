import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Icon from './Icon.svelte';

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
});
