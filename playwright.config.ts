import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' }, projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {} } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } }
], webServer: { command: 'pnpm --filter @huahua/demo dev --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI } });
