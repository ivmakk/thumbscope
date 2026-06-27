import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Standalone Vitest config: electron-vite's {main,preload,renderer} shape isn't Vitest-consumable.
// Only the renderer (React render tests) runs here; pure logic stays on node:test (*.test.ts).
export default defineConfig({
  plugins: [react()], // no tailwind - we never assert computed CSS
  resolve: {
    // Keep in sync with electron.vite.config.ts (renderer block).
    alias: {
      '@': resolve('src/renderer/src'),
      '@core': resolve('src/core')
    }
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.tsx'], // node:test owns *.test.ts; this tier is render-only
    globals: true,
    clearMocks: true,
    setupFiles: ['./src/renderer/test/setup.ts']
  }
})
