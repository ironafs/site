import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT || 4321);
const chromium = {
  browserName: 'chromium',
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 2,
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  projects: [
    // No WebGL at all: runs only the hero-shell and rustword specs' [no-webgl] tests (they skip everything else here).
    {
      name: 'chromium-nowebgl',
      testMatch: ['hero-shell.spec.mjs', 'rustword.spec.mjs'],
      use: { browserName: 'chromium', launchOptions: { args: ['--disable-gpu', '--disable-webgl'] }, viewport: { width: 1440, height: 900 } },
    },
    { name: 'chromium-desktop', use: { ...chromium, viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-desktop', use: { browserName: 'webkit', viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-phone', use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'webkit-phone', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
