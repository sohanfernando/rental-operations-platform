const { env } = require('node:process');
const { defineConfig } = require('@playwright/test');
const { testDatabaseUrl } = require('./tests/test-database.cjs');

const apiPort = '13000';
const webOrigin = 'http://127.0.0.1:15173';

module.exports = defineConfig({
  testDir: './tests/browser',
  workers: 1,
  forbidOnly: Boolean(env.CI),
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      name: 'API',
      command: 'node apps/api/dist/main.js',
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        API_PORT: apiPort,
        WEB_ORIGIN: webOrigin,
        DATABASE_URL: testDatabaseUrl(),
        // The Redis integration suite exercises job delivery separately.
        REDIS_URL: 'redis://127.0.0.1:1',
        HOLD_SECONDS: '900',
      },
    },
    {
      name: 'Vite preview',
      command: 'npm run preview --workspace @rental/web -- --host 127.0.0.1 --port 15173 --strictPort',
      url: webOrigin,
      reuseExistingServer: false,
      env: { API_PORT: apiPort },
    },
  ],
});
