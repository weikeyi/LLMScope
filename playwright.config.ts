import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  webServer: {
    command: 'pnpm exec llmscope-web --api-base-url http://127.0.0.1:8788 --port 3000',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  reporter: [
    ['list'],
    ['html'],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
