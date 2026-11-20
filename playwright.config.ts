import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests.
 *
 * They run against the production bundle (dist-server + dist/client) on a
 * dedicated port with a dedicated database so they never touch development data.
 * The project uses the system-installed Chrome (channel: 'chrome'), so no
 * browser download is required.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'node dist-server/main.js',
    url: 'http://localhost:4100/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: '4100',
      DATABASE_URL: './data/e2e.db',
      SESSION_SECRET: 'e2e-only-session-secret-value',
      REPORTS_DIR: './.tmp-test/e2e-reports',
      CORS_ORIGINS: 'http://localhost:4100',
      LOG_LEVEL: 'error',
      RATE_LIMIT_AUTH_MAX: '500',
      FREE_CHECKS_UNLIMITED: 'false',
    },
  },
});
