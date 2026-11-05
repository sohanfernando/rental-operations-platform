const { env } = require('node:process');
const { URL } = require('node:url');

function testDatabaseUrl() {
  const value = env.TEST_DATABASE_URL;
  const url = URL.parse(value ?? '');
  if (url?.protocol !== 'mysql:' || !/^\/[A-Za-z0-9_-]+_test$/.test(url.pathname)) {
    throw new Error('Set TEST_DATABASE_URL to a migrated MySQL database whose name ends in _test.');
  }
  return value;
}

module.exports = { testDatabaseUrl };
