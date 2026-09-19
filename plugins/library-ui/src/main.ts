import { mount } from 'svelte';
import LibraryPlugin from './LibraryPlugin.svelte';

mount(LibraryPlugin, {
  target: document.getElementById('app')!,
});
