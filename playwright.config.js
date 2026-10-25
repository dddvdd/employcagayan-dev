import { defineConfig, devices } from '@playwright/test'

const testPort = Number(process.env.EMPLOY_PLAYWRIGHT_PORT || 5173)

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  globalSetup: './tests/browser/local-server.js',
  use: {
    baseURL: `https://127.0.0.1:${testPort}`,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
