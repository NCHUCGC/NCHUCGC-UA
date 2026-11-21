// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1600, height: 900 },
    headless: true,
  },
  webServer: {
    command: 'npx serve -l 4173 .',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
