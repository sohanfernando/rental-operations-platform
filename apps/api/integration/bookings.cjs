const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { URLSearchParams } = require('node:url');
const { createApp } = require('../dist/app.js');
const { expireBooking } = require('../dist/bookings/booking-state.js');
const { parseEnvironment } = require('../dist/config.js');
const { createDatabase } = require('../dist/database/database.js');
const { databaseNow } = require('../dist/database/database-clock.js');
const { withEquipmentLock } = require('../dist/database/inventory-lock.js');
const { PrismaClient } = require('../dist/generated/prisma/client.js');
const { testDatabaseUrl } = require('../../../tests/test-database.cjs');

test('reservation guarantees across separate MySQL connections', async (t) => {
  const webOrigin = 'http://localhost:5173';
  const config = parseEnvironment({
    DATABASE_URL: testDatabaseUrl(),
    REDIS_URL: 'redis://127.0.0.1:1',
    WEB_ORIGIN: webOrigin,
    NODE_ENV: 'test',
  });
  const database = createDatabase(config.DATABASE_URL);
  const run = randomUUID().slice(0, 8);
  const typeIds = [];
  const userIds = [];
  const apps = [];

  t.after(async () => {
    try {
      await Promise.all(apps.map((app) => app.close()));
      const types = { equipmentTypeId: { in: typeIds } };
      await database.notification.deleteMany({ where: { event: { booking: types } } });
      await database.bookingEvent.deleteMany({ where: { booking: types } });
      await database.bookingAllocation.deleteMany({ where: { booking: types } });
      await database.booking.deleteMany({ where: types });
      await database.bookingRequest.deleteMany({ where: { userId: { in: userIds } } });
      await database.equipmentUnit.deleteMany({ where: types });
      await database.equipmentType.deleteMany({ where: { id: { in: typeIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await database.$disconnect();
    }
  });

  for (let i = 0; i < 2; i++) {
    const app = await createApp(config, { logger: false, abortOnError: false });
    apps.push(app);
    await app.listen(0, '127.0.0.1');
  }
  const origins = await Promise.all(apps.map((app) => app.getUrl()));
  const connections = await Promise.all(apps.map((app) =>
    app.get(PrismaClient).$queryRaw`SELECT CONNECTION_ID() AS connectionId`));
  assert.notEqual(connections[0][0].connectionId, connections[1][0].connectionId);

  async function session(label, role = 'CUSTOMER') {
    const token = randomBytes(32).toString('base64url');
    const user = await database.user.create({
      data: {
        email: `bookings-${label}-${run}@example.test`,
        passwordHash: 'unused-in-booking-tests',
        role,
        sessions: { create: {
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 3_600_000),
        } },
      },
    });
    userIds.push(user.id);
    return { id: user.id, cookie: `rental_session=${token}` };
  }

  const [first, second, staff] = await Promise.all([
    session('first'), session('second'), session('staff', 'STAFF'),
  ]);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Colombo' }).format(await databaseNow(database));
  function date(days) {
    const day = new Date(`${today}T00:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
  }

  async function equipment(label, statuses = ['IN_SERVICE']) {
    const type = await database.equipmentType.create({
      data: {
        name: `Integration ${label} ${run}`,
        description: 'Booking test equipment.',
        units: { create: statuses.map((status, index) => ({ assetTag: `${run}-${label}-${index}`, status })) },
      },
      include: { units: { orderBy: { id: 'asc' } } },
    });
    typeIds.push(type.id);
    return type;
  }

  function input(type, start = 1, end = 3, quantity = 1) {
    return { equipmentTypeId: type.id, startDate: date(start), endDate: date(end), quantity };
  }

  function request(path, { actor, method = 'GET', body, key, server = 0 } = {}) {
    const headers = { origin: webOrigin };
    if (actor) headers.cookie = actor.cookie;
    if (body) headers['content-type'] = 'application/json';
    if (key) headers['idempotency-key'] = key;
    return fetch(`${origins[server]}/api/v1${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
  }

  function hold(body, actor = first, key = randomUUID(), server = 0) {
    return request('/bookings/holds', { method: 'POST', actor, body, key, server });
  }

  function change(id, action, actor = first, key = randomUUID(), server = 0) {
    return request(`/bookings/${id}/${action}`, { method: 'POST', actor, key, server });
  }

  async function expectStatus(response, status) {
    assert.equal(response.status, status, await response.clone().text());
    return response;
  }

  async function preview(body) {
    const { equipmentTypeId, startDate, endDate } = body;
    const params = new URLSearchParams({ equipmentTypeId, startDate, endDate });
    const response = await expectStatus(await request(`/catalog/availability?${params}`), 200);
    return (await response.json()).availableUnits;
  }

  async function allocations(type) {
    return database.bookingAllocation.findMany({
      where: { booking: { equipmentTypeId: type.id } },
      orderBy: { unitId: 'asc' },
    });
  }

  function setDue(transaction, id) {
    return transaction.$executeRaw`
      UPDATE bookings SET holdExpiresAt = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE id = ${id}
    `;
  }

  await t.test('two customers compete for the last unit and exactly one allocation commits', async () => {
    const type = await equipment('last-unit');
    const body = input(type);
    assert.equal(await preview(body), 1);
    const results = await Promise.all([hold(body, first, 'same-key'), hold(body, second, 'same-key', 1)]);
    assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);

    const booking = await results.find((response) => response.status === 201).json();
    assert.equal(booking.startDate, body.startDate);
    assert.equal(booking.endDate, body.endDate);
    assert.deepEqual(await allocations(type), [{ bookingId: booking.id, unitId: type.units[0].id }]);
    assert.equal(await database.booking.count({ where: { equipmentTypeId: type.id } }), 1);
    assert.equal(await preview(body), 0);
  });

  await t.test('quantity is all-or-nothing, out-of-service units are excluded, and allocation order is stable', async () => {
    const type = await equipment('quantity', ['IN_SERVICE', 'OUT_OF_SERVICE', 'IN_SERVICE', 'IN_SERVICE']);
    await expectStatus(await hold(input(type, 1, 3, 4)), 409);
    assert.equal(await database.booking.count({ where: { equipmentTypeId: type.id } }), 0);
    assert.deepEqual(await allocations(type), []);

    const response = await expectStatus(await hold(input(type, 1, 3, 2)), 201);
    assert.equal((await response.json()).quantity, 2);
    assert.deepEqual((await allocations(type)).map(({ unitId }) => unitId), [type.units[0].id, type.units[2].id]);
  });

  await t.test('adjacent date ranges can share a unit and overlapping ranges cannot', async () => {
    const type = await equipment('dates');
    await expectStatus(await hold(input(type, 1, 3)), 201);
    await expectStatus(await hold(input(type, 3, 5), second), 201);
    await expectStatus(await hold(input(type, 2, 4), second), 409);
    assert.deepEqual((await allocations(type)).map(({ unitId }) => unitId), [type.units[0].id, type.units[0].id]);

    for (const body of [
      input(type, 1, 1), input(type, -1, 1), input(type, 1, 32), input(type, 181, 182),
      { ...input(type), startDate: '2027-02-30' }, input(type, 1, 3, 0), input(type, 1, 3, 11),
    ]) {
      await expectStatus(await hold(body), 400);
    }
    await expectStatus(await request('/bookings/holds', { method: 'POST', actor: first, body: input(type) }), 400);
  });

  await t.test('concurrent retries replay the same outcome and changed payloads conflict', async () => {
    const type = await equipment('retries');
    const body = input(type);
    const results = await Promise.all([hold(body, first, 'retry'), hold(body, first, 'retry', 1)]);
    assert.deepEqual(results.map((response) => response.status), [201, 201]);
    const [a, b] = await Promise.all(results.map((response) => response.json()));
    assert.deepEqual(a, b);
    assert.equal((await allocations(type)).length, 1);
    await expectStatus(await hold({ ...body, quantity: 2 }, first, 'retry'), 409);

    const confirmations = await Promise.all([
      change(a.id, 'confirm', first, 'retry'), change(a.id, 'confirm', first, 'retry', 1),
    ]);
    assert.deepEqual(confirmations.map((response) => response.status), [200, 200]);
    assert.deepEqual(await confirmations[0].json(), await confirmations[1].json());
    assert.equal(await database.bookingEvent.count({ where: { bookingId: a.id, toStatus: 'CONFIRMED' } }), 1);

    const rejected = await expectStatus(await hold(body, second, 'unavailable'), 409);
    await expectStatus(await change(a.id, 'cancel'), 200);
    const replay = await expectStatus(await hold(body, second, 'unavailable', 1), 409);
    assert.deepEqual(await replay.json(), await rejected.json());
    await expectStatus(await hold(body, second), 201);
    await expectStatus(await change(a.id, 'confirm'), 409);
    const original = await expectStatus(await change(a.id, 'confirm', first, 'retry'), 200);
    assert.equal((await original.json()).status, 'CONFIRMED');
  });

  await t.test('the same key cannot create bookings on two independently locked types', async () => {
    const [typeA, typeB] = await Promise.all([equipment('cross-a'), equipment('cross-b')]);
    const results = await Promise.all([
      hold(input(typeA), first, 'cross-type'), hold(input(typeB), first, 'cross-type', 1),
    ]);
    assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
    const conflict = await results.find((response) => response.status === 409).json();
    assert.match(conflict.message, /different input/);
    assert.equal((await allocations(typeA)).length + (await allocations(typeB)).length, 1);
    const bookings = await database.booking.findMany({ where: { equipmentTypeId: { in: [typeA.id, typeB.id] } } });
    assert.equal(bookings.length, 1);
    assert.equal(await database.bookingEvent.count({ where: { bookingId: bookings[0].id } }), 1);
  });

  await t.test('an elapsed hold releases availability without the expiry handler', async () => {
    const type = await equipment('elapsed');
    const body = input(type);
    const initial = await (await expectStatus(await hold(body), 201)).json();
    await setDue(database, initial.id);
    assert.equal(await preview(body), 1);
    await expectStatus(await hold(body, second), 201);
    assert.equal((await database.booking.findUnique({ where: { id: initial.id } })).status, 'HELD');
    const view = await expectStatus(await request(`/bookings/${initial.id}`, { actor: first }), 200);
    assert.equal((await view.json()).status, 'EXPIRED');
    const conflict = await expectStatus(await change(initial.id, 'confirm'), 409);
    assert.match((await conflict.json()).message, /expired/);
    assert.equal(await database.bookingEvent.count({ where: { bookingId: initial.id, toStatus: 'EXPIRED' } }), 1);
  });

  await t.test('confirmation racing expiry leaves exactly one valid terminal outcome', async () => {
    const expiryDatabase = apps[1].get(PrismaClient);
    for (const due of [false, true]) {
      const type = await equipment(due ? 'due-race' : 'live-race');
      const booking = await (await expectStatus(await hold(input(type)), 201)).json();
      let confirmation;
      let expiry;

      // Start both contenders while a separate connection owns the type lock.
      // The due case commits its deadline update before either contender can act.
      await withEquipmentLock(database, type.id, async (transaction) => {
        if (due) await setDue(transaction, booking.id);
        confirmation = change(booking.id, 'confirm');
        expiry = expireBooking(expiryDatabase, booking.id);
      });
      const [result] = await Promise.all([confirmation, expiry]);
      await expectStatus(result, due ? 409 : 200);
      assert.equal(await expireBooking(expiryDatabase, booking.id), false);

      const saved = await database.booking.findUnique({ where: { id: booking.id }, include: { events: { orderBy: { id: 'asc' } } } });
      const status = due ? 'EXPIRED' : 'CONFIRMED';
      assert.equal(saved.status, status);
      assert.deepEqual(saved.events.map(({ fromStatus, toStatus, actorId }) => [fromStatus, toStatus, actorId]), [
        [null, 'HELD', first.id], ['HELD', status, due ? null : first.id],
      ]);
      assert.ok(saved.events[1].occurredAt >= saved.events[0].occurredAt);
    }
  });

  await t.test('ownership and active inventory rules are enforced on the API', async () => {
    const type = await equipment('guarded');
    const body = input(type);
    const booking = await (await expectStatus(await hold(body), 201)).json();
    const path = `/staff/equipment-types/${type.id}/units/${type.units[0].id}`;
    const markOut = () => request(path, { actor: staff, method: 'PATCH', body: { status: 'OUT_OF_SERVICE' } });

    await expectStatus(await request(`/bookings/${booking.id}`, { actor: second }), 404);
    await expectStatus(await change(booking.id, 'confirm', second), 404);
    await expectStatus(await change(booking.id, 'cancel', second), 404);
    await expectStatus(await request(path, { actor: first, method: 'PATCH', body: { status: 'OUT_OF_SERVICE' } }), 403);
    await expectStatus(await hold(body, staff), 403);
    await expectStatus(await markOut(), 409);
    await expectStatus(await change(booking.id, 'confirm'), 200);
    await expectStatus(await markOut(), 409);

    await expectStatus(await change(booking.id, 'cancel'), 200);
    await expectStatus(await markOut(), 200);
    await expectStatus(await request(path, { actor: staff, method: 'DELETE' }), 409);
    assert.equal(await preview(body), 0);
    const list = await (await expectStatus(await request('/bookings', { actor: second }), 200)).json();
    assert.ok(!list.some((item) => item.id === booking.id));
  });

  await t.test('staff see overdue handover conflicts and can proceed only after the previous return', async () => {
    const type = await equipment('handover');
    const body = input(type, 0, 1);
    const firstBooking = await (await expectStatus(await hold(body), 201)).json();
    const staffBase = '/staff/bookings';
    const action = (id, name, actor = staff, server = 0) =>
      request(`${staffBase}/${id}/${name}`, { actor, method: 'POST', server });
    const unitPath = `/staff/equipment-types/${type.id}/units/${type.units[0].id}`;

    await expectStatus(await request(staffBase, { actor: first }), 403);
    await expectStatus(await action(firstBooking.id, 'pickup'), 409);
    await expectStatus(await change(firstBooking.id, 'confirm'), 200);
    await expectStatus(await action(firstBooking.id, 'pickup', first), 403);
    await expectStatus(await action(firstBooking.id, 'pickup'), 204);
    await expectStatus(await request(unitPath, {
      actor: staff, method: 'PATCH', body: { status: 'OUT_OF_SERVICE' },
    }), 409);

    // Model an open rental whose return date passed, without waiting for midnight.
    await database.booking.update({
      where: { id: firstBooking.id },
      data: { startDate: new Date(date(-2)), endDate: new Date(date(0)) },
    });
    const next = await (await expectStatus(await hold(body, second), 201)).json();
    await expectStatus(await change(next.id, 'confirm', second), 200);

    const dashboard = await (await expectStatus(await request(staffBase, { actor: staff }), 200)).json();
    assert.ok(dashboard.openRentals.find((item) => item.id === firstBooking.id).overdue);
    assert.deepEqual(dashboard.pickups.find((item) => item.id === next.id).conflicts, [
      { assetTag: type.units[0].assetTag, openBookingId: firstBooking.id },
    ]);
    await expectStatus(await action(next.id, 'pickup'), 409);
    assert.equal((await database.booking.findUnique({ where: { id: next.id } })).status, 'CONFIRMED');
    await expectStatus(await change(firstBooking.id, 'cancel'), 409);

    await expectStatus(await action(firstBooking.id, 'return'), 204);
    const attempts = await Promise.all([action(next.id, 'pickup'), action(next.id, 'pickup', staff, 1)]);
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [204, 409]);
    await expectStatus(await action(next.id, 'return'), 204);
    await expectStatus(await action(next.id, 'return'), 409);
    const detail = await (await expectStatus(await request(`${staffBase}/${next.id}`, { actor: staff }), 200)).json();
    assert.equal(detail.status, 'RETURNED');
    assert.deepEqual(detail.events.map(({ toStatus }) => toStatus), ['HELD', 'CONFIRMED', 'PICKED_UP', 'RETURNED']);
    assert.ok(detail.events.slice(-2).every(({ actorEmail }) => actorEmail === `bookings-staff-${run}@example.test`));
    const older = await (await expectStatus(await request(`${staffBase}?beforeId=${next.id}`, { actor: staff }), 200)).json();
    assert.ok(older.recentBookings.every(({ id }) => id < next.id));
    assert.ok(older.recentBookings.some(({ id }) => id === firstBooking.id));
    await expectStatus(await request(`${staffBase}?beforeId=invalid`, { actor: staff }), 400);

    const messages = await (await expectStatus(await request('/notifications', { actor: second }), 200)).json();
    assert.equal(messages.filter((message) => message.bookingId === next.id).length, 1);
    assert.ok(!messages.some((message) => message.bookingId === firstBooking.id));
    await expectStatus(await request('/notifications', { actor: staff }), 403);
  });
});
