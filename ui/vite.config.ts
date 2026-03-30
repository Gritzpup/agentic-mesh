import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5188,
    strictPort: true,
    host: true,
    proxy: {
      '/api': 'http://localhost:5189',
      '/events': {
        target: 'http://localhost:5189',
        ws: true
      }
    }
  }
})
