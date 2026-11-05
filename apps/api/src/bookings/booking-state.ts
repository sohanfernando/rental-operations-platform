import { databaseNow } from '../database/database-clock';
import { withEquipmentLock } from '../database/inventory-lock';
import { type Booking, type BookingStatus, type Prisma, type PrismaClient } from '../generated/prisma/client';
import { canTransition, effectiveStatus } from './booking-rules';

export async function transitionBooking(
  transaction: Prisma.TransactionClient,
  booking: Pick<Booking, 'id' | 'status'>,
  toStatus: BookingStatus,
  actorId: number | null,
  now: Date,
) {
  if (!canTransition(booking.status, toStatus)) {
    throw new Error('Invalid booking transition.');
  }

  await transaction.booking.update({ where: { id: booking.id }, data: { status: toStatus } });
  await transaction.bookingEvent.create({
    data: {
      bookingId: booking.id, fromStatus: booking.status, toStatus, actorId, occurredAt: now,
      notification: toStatus === 'CONFIRMED' || toStatus === 'EXPIRED' ? { create: {} } : undefined,
    },
  });
}

export async function expireIfDue(
  transaction: Prisma.TransactionClient,
  booking: Pick<Booking, 'id' | 'status' | 'holdExpiresAt'>,
  now: Date,
) {
  if (booking.status !== 'HELD' || effectiveStatus(booking, now) !== 'EXPIRED') return false;
  await transitionBooking(transaction, booking, 'EXPIRED', null, now);
  return true;
}

export async function expireBooking(database: PrismaClient, id: number) {
  const booking = await database.booking.findUnique({
    where: { id }, select: { equipmentTypeId: true },
  });
  if (!booking) return false;

  return withEquipmentLock(database, booking.equipmentTypeId, async (transaction) => {
    const current = await transaction.booking.findUniqueOrThrow({ where: { id } });
    return expireIfDue(transaction, current, await databaseNow(transaction));
  });
}
