import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Same routing as proxy/nginx.conf for `npm run dev` without Compose: the backend serves these paths
  // itself, so they are forwarded without a rewrite. /health is only proxied here, for local checks.
  // /auth/callback is bypassed and served by index.html so the SPA handles the OIDC PKCE redirect.
  server: {
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost',
      '/health': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost',
      '/auth': {
        target: process.env.VITE_AUTH_PROXY_TARGET ?? process.env.VITE_API_PROXY_TARGET ?? 'http://localhost',
        bypass(req) {
          if (req.url === '/auth/callback' || req.url?.startsWith('/auth/callback?')) {
            return '/index.html'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
})
