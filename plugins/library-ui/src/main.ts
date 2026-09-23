import { mount } from 'svelte';
import './global.css';
import LibraryPlugin from './LibraryPlugin.svelte';

mount(LibraryPlugin, {
  target: document.getElementById('app')!,
});
