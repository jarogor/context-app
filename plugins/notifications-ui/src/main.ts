import { mount } from 'svelte';
import './global.css';
import NotificationsPlugin from './NotificationsPlugin.svelte';

mount(NotificationsPlugin, {
  target: document.getElementById('app')!,
});
