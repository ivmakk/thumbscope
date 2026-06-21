import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@core': resolve('src/core') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // Bind IPv4 explicitly. Vite 7 defaults to IPv6 (`[::1]`); Electron resolves `localhost`
    // to IPv4 `127.0.0.1` and gets ERR_CONNECTION_REFUSED. Forcing the host keeps both on IPv4.
    server: { host: '127.0.0.1' },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@core': resolve('src/core')
      }
    }
  }
})
