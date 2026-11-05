const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { env } = require('node:process');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { Queue, QueueEvents } = require('bullmq');
const { Redis } = require('ioredis');
const { createApp } = require('../dist/app.js');
const { parseEnvironment } = require('../dist/config.js');
const { createDatabase } = require('../dist/database/database.js');
const { databaseNow } = require('../dist/database/database-clock.js');
const { expiryJob, expiryQueueName, reconcileJob, reconcileScheduler } = require('../dist/jobs/expiry-queue.js');
const { startExpiryWorker } = require('../dist/jobs/expiry-worker.js');
const { testDatabaseUrl } = require('../../../tests/test-database.cjs');

async function observe(probe, message) {
  const deadline = Date.now() + 8000;
  do {
    const value = await probe();
    if (value) return value;
    await delay(25);
  } while (Date.now() < deadline);
  assert.fail(message);
}

test('BullMQ runs delayed and reconciliation jobs against real Redis and MySQL', { timeout: 30000 }, async (t) => {
  assert.ok(env.TEST_REDIS_URL, 'Set TEST_REDIS_URL to a test Redis instance.');
  const prefix = `rental-test-${randomUUID()}`;
  const webOrigin = 'http://localhost:5173';
  const config = parseEnvironment({
    DATABASE_URL: testDatabaseUrl(),
    REDIS_URL: env.TEST_REDIS_URL,
    JOB_QUEUE_PREFIX: prefix,
    WEB_ORIGIN: webOrigin,
    NODE_ENV: 'test',
    RECONCILE_SECONDS: '600',
  });
  const database = createDatabase(config.DATABASE_URL);
  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, connectTimeout: 2000, retryStrategy: () => null,
  });
  const queue = new Queue(expiryQueueName, { connection, prefix });
  const queueEvents = new QueueEvents(expiryQueueName, { connection, prefix });
  const apps = [];
  let running;
  let customerId;
  let equipmentTypeId;

  t.after(async () => {
    try {
      await running?.close();
      await Promise.all(apps.map((app) => app.close()));
      await queue.obliterate({ force: true });
    } finally {
      await queueEvents.close();
      await queue.close();
      connection.disconnect();

      try {
        if (equipmentTypeId) {
          const where = { equipmentTypeId };
          await database.notification.deleteMany({ where: { event: { booking: where } } });
          await database.bookingEvent.deleteMany({ where: { booking: where } });
          await database.bookingAllocation.deleteMany({ where: { booking: where } });
          await database.booking.deleteMany({ where });
          await database.equipmentUnit.deleteMany({ where });
          await database.equipmentType.delete({ where: { id: equipmentTypeId } });
        }
        if (customerId) {
          await database.bookingRequest.deleteMany({ where: { userId: customerId } });
          await database.user.delete({ where: { id: customerId } });
        }
      } finally {
        await database.$disconnect();
      }
    }
  });

  const token = randomBytes(32).toString('base64url');
  const customer = await database.user.create({
    data: {
      email: `jobs-${prefix}@example.test`,
      passwordHash: 'unused-in-job-tests',
      sessions: { create: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3_600_000),
      } },
    },
  });
  customerId = customer.id;
  const equipment = await database.equipmentType.create({
    data: {
      name: `Queue test ${prefix}`, description: 'Expiry test equipment.',
      units: { create: { assetTag: prefix } },
    },
  });
  equipmentTypeId = equipment.id;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Colombo' }).format(await databaseNow(database));
  const endDate = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  const body = { equipmentTypeId, startDate: today, endDate, quantity: 1 };

  async function api(config) {
    const app = await createApp(config, { logger: false, abortOnError: false });
    apps.push(app);
    await app.listen(0, '127.0.0.1');
    return `${await app.getUrl()}/api/v1`;
  }

  async function hold(origin, key) {
    const response = await fetch(`${origin}/bookings/holds`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'idempotency-key': key,
        origin: webOrigin, cookie: `rental_session=${token}`,
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 201, await response.clone().text());
    return { booking: await response.json(), requestId: response.headers.get('x-request-id') };
  }

  function makeDue(id) {
    return database.$executeRaw`
      UPDATE bookings SET holdExpiresAt = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE id = ${id}
    `;
  }

  const status = async (id) => (await database.booking.findUniqueOrThrow({ where: { id } })).status;
  const expiryMessages = (id) => database.notification.count({
    where: { event: { bookingId: id, toStatus: 'EXPIRED' } },
  });

  await queueEvents.waitUntilReady();
  const origin = await api(config);
  const held = await hold(origin, 'delayed');
  const id = held.booking.id;
  const job = await observe(() => queue.getJob(`expiry-${id}`), 'No delayed job was enqueued after commit.');
  assert.equal(await job.getState(), 'delayed');
  assert.match(held.requestId, /^[a-f0-9-]{36}$/);
  assert.equal(job.data.requestId, held.requestId);
  assert.ok(job.opts.delay > 0);
  assert.equal(await status(id), 'HELD');

  running = startExpiryWorker(database, config);
  await running.worker.waitUntilReady();
  await observe(async () => {
    const completed = await queue.getJobs(['completed'], 0, 10);
    return completed.some(({ name }) => name === reconcileJob);
  }, 'The worker did not run its first scheduled reconciliation.');

  await makeDue(id);
  const delayedResult = job.waitUntilFinished(queueEvents, 8000);
  await job.promote();
  assert.equal(await delayedResult, true);
  assert.equal(await status(id), 'EXPIRED');
  assert.equal(await expiryMessages(id), 1);

  const repeat = await queue.add(expiryJob, { bookingId: id });
  assert.equal(await repeat.waitUntilFinished(queueEvents, 8000), false);
  assert.equal(await expiryMessages(id), 1);

  await running.close();
  running = undefined;

  const offlineOrigin = await api({ ...config, REDIS_URL: 'redis://127.0.0.1:1' });
  const missed = await hold(offlineOrigin, 'missed-enqueue');
  await makeDue(missed.booking.id);
  assert.equal(await status(missed.booking.id), 'HELD');
  assert.equal(await queue.getJob(`expiry-${missed.booking.id}`), undefined);

  running = startExpiryWorker(database, { ...config, RECONCILE_SECONDS: 1 });
  await running.worker.waitUntilReady();
  await observe(async () => await status(missed.booking.id) === 'EXPIRED',
    'Periodic reconciliation did not recover the missed job.');
  assert.ok(await queue.getJobScheduler(reconcileScheduler));
  assert.equal(await expiryMessages(missed.booking.id), 1);

  const confirmed = await hold(origin, 'confirmed');
  const confirmedId = confirmed.booking.id;
  const confirm = await fetch(`${origin}/bookings/${confirmedId}/confirm`, {
    method: 'POST',
    headers: { origin: webOrigin, cookie: `rental_session=${token}`, 'idempotency-key': 'confirm' },
  });
  assert.equal(confirm.status, 200);
  const late = await observe(() => queue.getJob(`expiry-${confirmedId}`), 'The confirmed booking had no delayed job.');
  await makeDue(confirmedId);
  const lateResult = late.waitUntilFinished(queueEvents, 8000);
  await late.promote();
  assert.equal(await lateResult, false);
  assert.equal(await status(confirmedId), 'CONFIRMED');
  assert.equal(await expiryMessages(confirmedId), 0);

  const messages = await fetch(`${origin}/notifications`, { headers: { cookie: `rental_session=${token}` } });
  assert.equal(messages.status, 200);
  const bodyMessages = await messages.json();
  assert.equal(bodyMessages.length, 3);
  assert.equal(bodyMessages.filter(({ message }) => /hold expired/.test(message)).length, 2);
  assert.match(bodyMessages.find(({ bookingId }) => bookingId === confirmedId).message, /was confirmed/);
  assert.equal(new Set(bodyMessages.map(({ eventId }) => eventId)).size, 3);
});
