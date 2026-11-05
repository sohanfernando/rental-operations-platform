const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createApp } = require('../dist/app.js');
const { parseEnvironment } = require('../dist/config.js');

const localEnvironment = {
  DATABASE_URL: 'mysql://rental:local-password@127.0.0.1:3306/rental',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

test('environment validation supplies a default port and rejects malformed settings', () => {
  assert.equal(parseEnvironment(localEnvironment).API_PORT, 3000);
  assert.equal(parseEnvironment({ ...localEnvironment, API_PORT: '3001' }).API_PORT, 3001);
  assert.throws(() => parseEnvironment({}), /DATABASE_URL, REDIS_URL/);
  assert.throws(
    () => parseEnvironment({ ...localEnvironment, DATABASE_URL: 'mysql://rental@localhost/' }),
    /Invalid configuration: DATABASE_URL\./,
  );
  assert.throws(
    () => parseEnvironment({
      API_PORT: '65536',
      DATABASE_URL: 'https://user:do-not-log@127.0.0.1',
      REDIS_URL: 'mysql://127.0.0.1',
    }),
    { message: 'Invalid configuration: API_PORT, DATABASE_URL, REDIS_URL. See .env.example.' },
  );
});

test('the versioned health endpoint and OpenAPI document are served over HTTP', async (t) => {
  const app = await createApp(parseEnvironment(localEnvironment), { logger: false });
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();

  const health = await fetch(`${origin}/api/v1/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const openApi = await fetch(`${origin}/api/v1/docs-json`);
  assert.equal(openApi.status, 200);
  const spec = await openApi.json();
  assert.ok(spec.paths['/api/v1/health'].get.responses['200']);
});
