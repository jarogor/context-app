import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import Badge from './Badge.svelte';

describe('Badge', () => {
  it('отображает содержимое', () => {
    const children = createRawSnippet(() => ({ render: () => '<span>library</span>' }));

    render(Badge, { props: { children } });

    expect(screen.getByText('library')).toBeTruthy();
  });
});
