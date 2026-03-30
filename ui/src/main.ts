import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

// Global technical suppression (DADDU FIX: Clean HUD logs)
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && (
      args[0].includes('THREE.Clock') || 
      args[0].includes('EME is not supported') ||
      args[0].includes('requestAnimationFrame') ||
      args[0].includes('initEternlDomAPI')
  )) return;
  originalWarn.apply(console, args);
};

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
