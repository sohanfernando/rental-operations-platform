const { randomBytes, randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { test: base, expect } = require('@playwright/test');
const { hashPassword } = require('../../apps/api/dist/auth/password.js');
const { businessToday, calendarDate } = require('../../apps/api/dist/bookings/booking-rules.js');
const { databaseNow } = require('../../apps/api/dist/database/database-clock.js');
const { createDatabase } = require('../../apps/api/dist/database/database.js');
const { testDatabaseUrl } = require('../test-database.cjs');

const test = base.extend({
  rental: async ({ baseURL }, use) => {
    const database = createDatabase(testDatabaseUrl());
    const suffix = randomUUID().slice(0, 12);
    const equipmentName = `Smoke camera ${suffix}`;
    const assetTag = `SMOKE-${suffix.toUpperCase()}`;
    const account = (role) => ({
      email: `browser-${role}-${suffix}@example.test`,
      password: randomBytes(18).toString('base64url'),
    });
    const customer = account('customer');
    const staff = account('staff');
    let equipmentTypeId;

    try {
      const equipment = await database.equipmentType.create({
        data: {
          name: equipmentName,
          description: 'Isolated equipment for the browser smoke test.',
          category: 'CAMERAS',
          dailyRateMinor: 125025,
          units: { create: { assetTag } },
        },
      });
      equipmentTypeId = equipment.id;

      await use({
        baseURL, customer, staff, equipmentTypeId, equipmentName, assetTag,
        async rentalDates(daysUntilStart) {
          const today = businessToday(await databaseNow(database));
          const shift = (days) => calendarDate(new Date(today.getTime() + days * 86_400_000));
          return { startDate: shift(daysUntilStart), endDate: shift(daysUntilStart + 2) };
        },
        async createStaff() {
          await database.user.create({
            data: { email: staff.email, role: 'STAFF', passwordHash: await hashPassword(staff.password) },
          });
        },
      });
    } finally {
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
        const emails = [customer.email, staff.email];
        await database.contactMessage.deleteMany({ where: { email: { in: emails } } });
        await database.bookingRequest.deleteMany({ where: { user: { email: { in: emails } } } });
        await database.user.deleteMany({ where: { email: { in: emails } } });
      } finally {
        await database.$disconnect();
      }
    }
  },
});

async function signIn(page, account) {
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('customer registers, checks availability, places a hold, and confirms', async ({ page, rental }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Featured equipment' })).toBeVisible();
  const footer = page.getByRole('navigation', { name: 'Footer navigation' });
  await footer.getByRole('link', { name: 'About us' }).click();
  await expect(page.getByRole('heading', { name: 'About us' })).toBeVisible();
  await footer.getByRole('link', { name: 'Contact us' }).click();
  await expect(page.getByRole('heading', { name: 'Send a message' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Demo customer');
  await page.getByLabel('Email', { exact: true }).fill(rental.customer.email);
  await page.getByLabel('Message', { exact: true }).fill('Can I collect my rental tomorrow?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Your message was sent to the rental desk.')).toBeVisible();
  await page.goto('/register');
  await page.getByLabel('Email').fill(rental.customer.email);
  await page.getByLabel('Password', { exact: true }).fill(rental.customer.password);
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Account created. Sign in to continue.')).toBeVisible();
  await signIn(page, rental.customer);
  await expect(page).toHaveURL('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Catalog', exact: true }).click();

  const dates = await rental.rentalDates(1);
  await page.getByLabel('Start date').fill(dates.startDate);
  await page.getByLabel('End date').fill(dates.endDate);
  await page.getByLabel('Search equipment').fill(rental.equipmentName);
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('CAMERAS');
  await page.getByLabel('Max daily rate (LKR)').fill('1000');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText(/No equipment matches these filters/)).toBeVisible();
  await page.getByLabel('Max daily rate (LKR)').fill('1500');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await page.getByRole('link', { name: `Check availability for ${rental.equipmentName}`, exact: true }).click();
  await expect(page.getByLabel('Start date')).toHaveValue(dates.startDate);
  await expect(page.getByLabel('End date')).toHaveValue(dates.endDate);
  await expect(page.getByText('1 unit available for these dates.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Estimated total LKR\s*2,500\.50/)).toBeVisible();
  await page.getByRole('button', { name: 'Place hold', exact: true }).click();
  await expect(page.getByText(/Hold expires in/)).toBeVisible();
  await expect(page.getByText(/Rental total LKR\s*2,500\.50/)).toBeVisible();
  expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBe(390);

  await page.getByRole('button', { name: 'Confirm reservation', exact: true }).click();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My bookings', exact: true }).click();
  const booking = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: rental.equipmentName }) });
  await expect(booking).toContainText('Confirmed');

  await page.getByRole('link', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('link', { name: `Your ${rental.equipmentName} reservation was confirmed.` })).toBeVisible();
});

test('staff records pickup and return and sees both events', async ({ page, request, rental }) => {
  await rental.createStaff();
  const headers = { origin: rental.baseURL };
  expect((await request.post('/api/v1/auth/register', { headers, data: rental.customer })).status()).toBe(201);
  expect((await request.post('/api/v1/auth/login', { headers, data: rental.customer })).status()).toBe(200);
  const dates = await rental.rentalDates(0);
  const hold = await request.post('/api/v1/bookings/holds', {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: { ...dates, equipmentTypeId: rental.equipmentTypeId, quantity: 1 },
  });
  expect(hold.status()).toBe(201);
  const { id } = await hold.json();
  const confirm = await request.post(`/api/v1/bookings/${id}/confirm`, {
    headers: { ...headers, 'idempotency-key': randomUUID() },
  });
  expect(confirm.status()).toBe(200);

  await page.goto('/login');
  await signIn(page, rental.staff);
  const pickups = page.getByRole('region', { name: 'Confirmed pickups' });
  await pickups.getByRole('link', { name: `${rental.equipmentName} #${id}` }).click();
  await expect(page.getByText(`Units ${rental.assetTag}`)).toBeVisible();
  await page.getByRole('button', { name: 'Record pickup', exact: true }).click();
  await expect(page.getByText('Pickup recorded.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record return', exact: true }).click();
  await expect(page.getByText('Return recorded.', { exact: true })).toBeVisible();

  const timeline = page.getByRole('region', { name: 'Booking events' });
  await expect(timeline.getByRole('listitem').filter({ hasText: 'Confirmed → Picked up' })).toContainText(rental.staff.email);
  await expect(timeline.getByRole('listitem').filter({ hasText: 'Picked up → Returned' })).toContainText(rental.staff.email);
  const saved = await request.get(`/api/v1/bookings/${id}`);
  expect(saved.status()).toBe(200);
  expect((await saved.json()).status).toBe('RETURNED');

  await page.getByRole('link', { name: 'Inventory', exact: true }).click();
  const product = page.locator('details').filter({ hasText: rental.equipmentName });
  await product.locator('summary').click();
  await product.getByLabel('Daily rate per unit (LKR)').fill('2000');
  await product.getByRole('button', { name: 'Save equipment type' }).click();
  await expect(product.getByText('Equipment type updated.')).toBeVisible();
  await product.getByLabel('Choose product images').setInputFiles([
    resolve(__dirname, '../../apps/api/prisma/demo-images/sony-a7-iv.jpg'),
    resolve(__dirname, '../../apps/api/prisma/demo-images/manfrotto-befree.jpg'),
  ]);
  await product.getByRole('button', { name: 'Upload images' }).click();
  await expect(product.getByText('Product images added.')).toBeVisible();
  await page.goto(`/equipment/${rental.equipmentTypeId}`);
  await expect(page.getByText(/LKR\s*2,000\.00 per unit/)).toBeVisible();
  await page.getByRole('button', { name: 'Show photo 2' }).click();
  await expect.poll(() => page.getByRole('img', { name: `${rental.equipmentName} photo 2` }).evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
});
