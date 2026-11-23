import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const STACK_URL = process.env.AUTHENTIK_THEME_TEST_URL
const BASE_URL = STACK_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(STACK_URL ? [{
      name: 'firefox',
      testMatch: '**/authentik-theme.spec.ts',
      use: devices['Desktop Firefox'],
    }] : []),
  ],
  webServer: STACK_URL ? undefined : {
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
