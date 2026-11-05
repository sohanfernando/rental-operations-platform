const assert = require('node:assert/strict');
const { test } = require('node:test');
const { canTransition, rentalRange } = require('../dist/bookings/booking-rules.js');

test('the booking lifecycle allows only defined transitions', () => {
  const statuses = ['HELD', 'CONFIRMED', 'PICKED_UP', 'RETURNED', 'CANCELLED', 'EXPIRED'];
  const permitted = [
    'HELD:CONFIRMED', 'HELD:CANCELLED', 'HELD:EXPIRED',
    'CONFIRMED:PICKED_UP', 'CONFIRMED:CANCELLED', 'PICKED_UP:RETURNED',
  ];

  for (const from of statuses) {
    for (const to of statuses) {
      assert.equal(canTransition(from, to), permitted.includes(`${from}:${to}`), `${from} to ${to}`);
    }
  }
});

test('rental validation switches calendar day at midnight in Colombo', () => {
  const range = { startDate: '2027-01-10', endDate: '2027-01-11' };
  assert.equal(rentalRange(range, new Date('2027-01-10T18:29:59.999Z')).startDate.toISOString(), '2027-01-10T00:00:00.000Z');
  assert.throws(() => rentalRange(range, new Date('2027-01-10T18:30:00.000Z')), /today or later/);
  assert.throws(
    () => rentalRange({ ...range, endDate: '2027-02-10' }, new Date('2027-01-09T19:00:00Z')),
    /between 1 and 30 days/,
  );
  assert.throws(
    () => rentalRange({ startDate: '2027-07-10', endDate: '2027-07-11' }, new Date('2027-01-09T19:00:00Z')),
    /within 180 days/,
  );
});
