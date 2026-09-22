import { mount } from 'svelte';
import NotificationsPlugin from './NotificationsPlugin.svelte';

mount(NotificationsPlugin, {
  target: document.getElementById('app')!,
});
