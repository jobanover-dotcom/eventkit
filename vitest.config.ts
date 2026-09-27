import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws outside a server bundle. Aliasing it to an empty
      // stub lets a unit test import a service while the guard still applies in
      // a real build, which is what keeps the boundary honest.
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
