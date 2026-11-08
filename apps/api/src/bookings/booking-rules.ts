import { BadRequestException } from '@nestjs/common';
import { type BookingStatus, type Prisma } from '../generated/prisma/client';

export const businessTimezone = 'Asia/Colombo';
export const maximumRentalDays = 30;
export const maximumAdvanceDays = 180;
export const maximumQuantity = 10;

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const businessDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: businessTimezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  HELD: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus) {
  return transitions[from].includes(to);
}

export function calendarDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function businessToday(now: Date) {
  const parts = businessDateFormat.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00.000Z`);
}

export function rentalRange(input: { startDate: string; endDate: string }, now: Date) {
  const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
  const endDate = new Date(`${input.endDate}T00:00:00.000Z`);
  const today = businessToday(now);
  const days = (endDate.getTime() - startDate.getTime()) / millisecondsPerDay;

  if (startDate < today) throw new BadRequestException('The start date must be today or later in Asia/Colombo.');
  if (days < 1 || days > maximumRentalDays) {
    throw new BadRequestException(`Rentals must last between 1 and ${maximumRentalDays} days.`);
  }
  if (startDate.getTime() - today.getTime() > maximumAdvanceDays * millisecondsPerDay) {
    throw new BadRequestException(`The start date must be within ${maximumAdvanceDays} days.`);
  }
  return { startDate, endDate, days };
}

export function activeBooking(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ['CONFIRMED', 'PICKED_UP'] } },
      { status: 'HELD', holdExpiresAt: { gt: now } },
    ],
  };
}

export function eligibleUnits(
  range: { startDate: Date; endDate: Date },
  now: Date,
): Prisma.EquipmentUnitWhereInput {
  return {
    status: 'IN_SERVICE',
    allocations: {
      none: {
        booking: {
          ...activeBooking(now),
          startDate: { lt: range.endDate },
          endDate: { gt: range.startDate },
        },
      },
    },
  };
}

export function effectiveStatus(
  booking: { status: BookingStatus; holdExpiresAt: Date },
  now: Date,
): BookingStatus {
  return booking.status === 'HELD' && booking.holdExpiresAt <= now ? 'EXPIRED' : booking.status;
}
