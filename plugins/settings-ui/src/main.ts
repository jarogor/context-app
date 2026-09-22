import { mount } from 'svelte';
import SettingsPlugin from './SettingsPlugin.svelte';

mount(SettingsPlugin, {
  target: document.getElementById('app')!,
});
