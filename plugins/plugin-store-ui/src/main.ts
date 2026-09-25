import { mount } from 'svelte';
import './global.css';
import StorePlugin from './StorePlugin.svelte';

mount(StorePlugin, {
  target: document.getElementById('app')!,
});
