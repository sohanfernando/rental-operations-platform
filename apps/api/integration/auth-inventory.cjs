const assert = require('node:assert/strict');
const { Blob, Buffer } = require('node:buffer');
const { createHash, randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { createApp } = require('../dist/app.js');
const { hashPassword } = require('../dist/auth/password.js');
const { parseEnvironment } = require('../dist/config.js');
const { createDatabase } = require('../dist/database/database.js');
const { testDatabaseUrl } = require('../../../tests/test-database.cjs');

test('auth and inventory over HTTP with MySQL', async (t) => {
  const webOrigin = 'http://localhost:5173';
  const environment = parseEnvironment({
    DATABASE_URL: testDatabaseUrl(),
    REDIS_URL: 'redis://127.0.0.1:6379',
    WEB_ORIGIN: webOrigin,
    NODE_ENV: 'test',
  });
  const database = createDatabase(environment.DATABASE_URL);
  const suffix = randomUUID();
  const customer = { email: `customer-${suffix}@example.test`, password: 'Integration-test-password' };
  const staff = { email: `staff-${suffix}@example.test`, password: 'Integration-test-password' };
  const label = `Integration camera ${suffix}`;
  const app = await createApp(environment, { logger: false, abortOnError: false });

  t.after(async () => {
    try {
      await app.close();
      await database.contactMessage.deleteMany({ where: { email: customer.email } });
      await database.equipmentUnit.deleteMany({ where: { equipmentType: { name: { startsWith: label } } } });
      await database.equipmentType.deleteMany({ where: { name: { startsWith: label } } });
      await database.user.deleteMany({ where: { email: { in: [customer.email, staff.email] } } });
    } finally {
      await database.$disconnect();
    }
  });

  await app.listen(0, '127.0.0.1');
  const api = `${await app.getUrl()}/api/v1`;
  const inventory = '/staff/equipment-types';

  function request(path, { method = 'GET', body, cookie, origin = webOrigin } = {}) {
    const headers = {};
    if (origin) headers.origin = origin;
    const multipart = body instanceof FormData;
    if (body && !multipart) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    return fetch(api + path, { method, headers, body: multipart ? body : body ? JSON.stringify(body) : undefined });
  }

  async function login(credentials) {
    const response = await request('/auth/login', { method: 'POST', body: credentials });
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie?.includes('HttpOnly'));
    assert.ok(setCookie?.includes('SameSite=Lax'));
    assert.ok(setCookie?.includes('Expires='));
    return { user: await response.json(), cookie: setCookie.split(';')[0] };
  }

  let customerCookie;
  let staffCookie;

  await t.test('registration enforces customer role, same origin, and unique email', async () => {
    const body = { ...customer, email: customer.email.toUpperCase() };
    for (const origin of [null, 'https://elsewhere.example']) {
      assert.equal((await request('/auth/register', { method: 'POST', body, origin })).status, 403);
    }
    assert.equal((await request('/auth/register', {
      method: 'POST',
      body: { ...body, role: 'STAFF' },
    })).status, 400);

    const registered = await request('/auth/register', { method: 'POST', body });
    assert.equal(registered.status, 201);
    const user = await registered.json();
    assert.deepEqual(user, { id: user.id, email: customer.email, role: 'CUSTOMER' });
    assert.equal((await request('/auth/register', { method: 'POST', body })).status, 409);
  });

  await t.test('sessions enforce role and expiry and store only a hash', async () => {
    assert.equal((await request(inventory)).status, 401);
    assert.equal((await request('/auth/login', {
      method: 'POST',
      body: { ...customer, password: 'bad password' },
    })).status, 401);

    const result = await login(customer);
    customerCookie = result.cookie;
    const token = customerCookie.slice(customerCookie.indexOf('=') + 1);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const stored = await database.session.findUnique({ where: { tokenHash } });
    assert.ok(stored && stored.userId === result.user.id && stored.tokenHash !== token);

    const current = await request('/auth/me', { cookie: customerCookie });
    assert.equal(current.status, 200);
    assert.deepEqual(await current.json(), result.user);
    assert.equal((await request(inventory, { cookie: customerCookie })).status, 403);
    assert.equal((await request(inventory, {
      method: 'POST', body: { name: label, description: 'Denied' }, cookie: customerCookie,
    })).status, 403);

    await database.session.update({ where: { tokenHash }, data: { expiresAt: new Date(0) } });
    assert.equal((await request('/auth/me', { cookie: customerCookie })).status, 401);
    customerCookie = (await login(customer)).cookie;
  });

  await t.test('staff can manage types and units while catalog exposes product fields only', async () => {
    await database.user.create({
      data: { email: staff.email, passwordHash: await hashPassword(staff.password), role: 'STAFF' },
    });
    staffCookie = (await login(staff)).cookie;
    const body = { name: label, description: 'Test camera.' };
    assert.equal((await request(inventory, {
      method: 'POST', body, cookie: staffCookie, origin: 'https://elsewhere.example',
    })).status, 403);

    const created = await request(inventory, { method: 'POST', body, cookie: staffCookie });
    assert.equal(created.status, 201);
    const type = await created.json();
    const path = `${inventory}/${type.id}`;

    const typeEdited = await request(path, {
      method: 'PATCH', body: { name: label + ' updated' }, cookie: staffCookie,
    });
    assert.equal(typeEdited.status, 200);
    assert.equal((await typeEdited.json()).name, label + ' updated');

    const tag = `C-${suffix}`;
    const unitCreated = await request(`${path}/units`, {
      method: 'POST', body: { assetTag: tag }, cookie: staffCookie,
    });
    assert.equal(unitCreated.status, 201);
    const unit = await unitCreated.json();
    assert.equal(unit.assetTag, tag.toUpperCase());
    assert.equal(unit.status, 'IN_SERVICE');
    assert.equal((await request(`${path}/units`, {
      method: 'POST', body: { assetTag: tag }, cookie: staffCookie,
    })).status, 409);

    const unitPath = `${path}/units/${unit.id}`;
    assert.equal((await request(unitPath, {
      method: 'PATCH', body: { status: null }, cookie: staffCookie,
    })).status, 400);
    const edited = await request(unitPath, {
      method: 'PATCH', body: { status: 'OUT_OF_SERVICE' }, cookie: staffCookie,
    });
    assert.equal(edited.status, 200);
    assert.equal((await edited.json()).status, 'OUT_OF_SERVICE');

    const stock = await request(inventory, { cookie: staffCookie });
    assert.equal(stock.status, 200);
    assert.equal((await stock.json()).find((item) => item.id === type.id).units.length, 1);
    const catalog = await request('/catalog/equipment-types');
    assert.equal(catalog.status, 200);
    assert.deepEqual((await catalog.json()).find((item) => item.id === type.id), {
      id: type.id, name: label + ' updated', description: body.description, images: [],
    });

    assert.equal((await request(path, { method: 'DELETE', cookie: staffCookie })).status, 409);
    assert.equal((await request(unitPath, { method: 'DELETE', cookie: staffCookie })).status, 204);
    assert.equal((await request(unitPath, { method: 'DELETE', cookie: staffCookie })).status, 404);
    assert.equal((await request(path, { method: 'DELETE', cookie: staffCookie })).status, 204);
  });

  await t.test('staff can upload images and the catalog serves only validated photo bytes', async () => {
    const item = await request(inventory, {
      method: 'POST', body: { name: label + ' gallery', description: 'Gallery test.' }, cookie: staffCookie,
    });
    assert.equal(item.status, 201);
    const { id } = await item.json();
    const path = `${inventory}/${id}/images`;
    const photo = await readFile(resolve(__dirname, '../prisma/demo-images/sony-a7-iv.jpg'));
    const upload = (cookie, bytes = photo, count = 1) => {
      const body = new FormData();
      for (let i = 0; i < count; i++) body.append('images', new Blob([bytes], { type: 'image/jpeg' }), 'photo.jpg');
      return request(path, { method: 'POST', body, cookie });
    };

    assert.equal((await upload(customerCookie)).status, 403);
    assert.equal((await upload(staffCookie, 'plain text')).status, 400);
    assert.equal((await upload(staffCookie, photo, 2)).status, 204);
    assert.equal((await upload(staffCookie, photo, 4)).status, 409);
    const catalog = await (await request('/catalog/equipment-types')).json();
    const images = catalog.find((equipment) => equipment.id === id).images;
    assert.equal(images.length, 2);
    assert.ok(images[0].id < images[1].id);
    const file = await request(`/catalog/images/${images[0].id}`);
    assert.equal(file.headers.get('content-type'), 'image/jpeg');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), photo);
    assert.equal((await request(`${path}/${images[0].id}`, { method: 'DELETE', cookie: staffCookie })).status, 204);
    assert.equal((await request(`/catalog/images/${images[0].id}`)).status, 404);
  });

  await t.test('contact messages require same-origin writes and staff access to read', async () => {
    const body = { name: 'Demo customer', email: customer.email, message: 'Can I collect my camera tomorrow?' };
    assert.equal((await request('/contact', { method: 'POST', origin: null, body })).status, 403);
    assert.equal((await request('/contact', { method: 'POST', body: { ...body, message: 'short' } })).status, 400);
    assert.equal((await request('/contact', { method: 'POST', body })).status, 204);
    assert.equal((await request('/staff/contact')).status, 401);
    assert.equal((await request('/staff/contact', { cookie: customerCookie })).status, 403);
    const inbox = await request('/staff/contact', { cookie: staffCookie });
    assert.equal(inbox.status, 200);
    const message = (await inbox.json()).find((item) => item.email === body.email);
    assert.equal(message.message, body.message);
  });

  await t.test('logout revokes the session and sign-in attempts are rate limited', async () => {
    const loggedOut = await request('/auth/logout', { method: 'POST', cookie: customerCookie });
    assert.equal(loggedOut.status, 204);
    assert.ok(loggedOut.headers.get('set-cookie')?.startsWith('rental_session=;'));
    assert.equal((await request('/auth/me', { cookie: customerCookie })).status, 401);

    let status = 0;
    for (let attempt = 0; attempt < 11 && status !== 429; attempt++) {
      status = (await request('/auth/login', {
        method: 'POST',
        body: { email: `missing-${suffix}@example.test`, password: 'bad password' },
      })).status;
      assert.ok(status === 401 || status === 429);
    }
    assert.equal(status, 429);
  });
});
