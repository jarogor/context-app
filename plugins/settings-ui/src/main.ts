import { mount } from 'svelte';
import './global.css';
import SettingsPlugin from './SettingsPlugin.svelte';

mount(SettingsPlugin, {
  target: document.getElementById('app')!,
});
