import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_ENV, type AppEnvironment } from '../config';
import { databaseNow } from '../database/database-clock';
import { withEquipmentLock } from '../database/inventory-lock';
import { Prisma, PrismaClient, type BookingStatus } from '../generated/prisma/client';
import { ExpiryQueue } from '../jobs/expiry-queue';
import { calendarDate, canTransition, effectiveStatus, eligibleUnits, rentalRange } from './booking-rules';
import { expireIfDue, transitionBooking } from './booking-state';
import { type AvailabilityQuery, type BookingResponse, type CreateHoldDto } from './bookings.dto';
import { bookingResult, runBookingRequest } from './idempotency';
import { rentalPrice } from './rental-price';

const details = {
  equipmentType: { select: { name: true } },
  _count: { select: { allocations: true } },
} satisfies Prisma.BookingInclude;

type BookingDetails = Prisma.BookingGetPayload<{ include: typeof details }>;

function bookingView(booking: BookingDetails, status: BookingStatus): BookingResponse {
  return {
    id: booking.id,
    equipmentTypeId: booking.equipmentTypeId,
    equipmentName: booking.equipmentType.name,
    startDate: calendarDate(booking.startDate),
    endDate: calendarDate(booking.endDate),
    quantity: booking._count.allocations,
    status,
    holdExpiresAt: booking.holdExpiresAt.toISOString(),
    dailyRateMinor: booking.dailyRateMinor,
    totalMinor: booking.totalMinor,
  };
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly database: PrismaClient,
    @Inject(APP_ENV) private readonly environment: AppEnvironment,
    private readonly expiryQueue: ExpiryQueue,
  ) {}

  async availability(input: AvailabilityQuery) {
    const now = await databaseNow(this.database);
    const range = rentalRange(input, now);
    const type = await this.database.equipmentType.findUnique({
      where: { id: input.equipmentTypeId },
      select: { id: true, dailyRateMinor: true },
    });
    if (!type) throw new NotFoundException('Equipment type not found.');
    const availableUnits = await this.database.equipmentUnit.count({
      where: { equipmentTypeId: type.id, ...eligibleUnits(range, now) },
    });
    return { availableUnits, rentalDays: range.days, ...rentalPrice(type.dailyRateMinor, range.days, input.quantity ?? 1) };
  }

  async createHold(customerId: number, input: CreateHoldDto, key?: string, requestId?: string) {
    const { equipmentTypeId, startDate, endDate, quantity, expectedTotalMinor } = input;
    const booking = await runBookingRequest(
      this.database, customerId, 'CREATE_HOLD', key,
      { equipmentTypeId, startDate, endDate, quantity, expectedTotalMinor },
      () => equipmentTypeId,
      async (transaction) => {
        const now = await databaseNow(transaction);
        const { days, ...range } = rentalRange(input, now);
        const type = await transaction.equipmentType.findUniqueOrThrow({
          where: { id: equipmentTypeId },
          select: { dailyRateMinor: true },
        });
        const price = rentalPrice(type.dailyRateMinor, days, quantity);
        if (expectedTotalMinor !== undefined && price.totalMinor !== expectedTotalMinor) {
          return { conflict: 'The rental price changed. Check availability and review the new total.' };
        }
        const units = await transaction.equipmentUnit.findMany({
          where: { equipmentTypeId, ...eligibleUnits(range, now) },
          orderBy: { id: 'asc' },
          take: quantity,
          select: { id: true },
        });
        if (units.length < quantity) {
          return { conflict: 'There are not enough units available for those dates.' };
        }

        const booking = await transaction.booking.create({
          data: {
            ...range,
            ...price,
            equipmentTypeId,
            customerId,
            status: 'HELD',
            createdAt: now,
            holdExpiresAt: new Date(now.getTime() + this.environment.HOLD_SECONDS * 1000),
            allocations: { createMany: { data: units.map(({ id }) => ({ unitId: id })) } },
            events: { create: { actorId: customerId, toStatus: 'HELD', occurredAt: now } },
          },
          include: details,
        });
        return { booking: bookingView(booking, 'HELD') };
      },
    );
    // MySQL committed before we attempt any Redis work.
    void this.expiryQueue.schedule(booking.id, booking.holdExpiresAt, requestId);
    return booking;
  }

  async list(customerId: number) {
    const now = await databaseNow(this.database);
    const bookings = await this.database.booking.findMany({
      where: { customerId },
      orderBy: { id: 'desc' },
      include: details,
    });
    return bookings.map((booking) => bookingView(booking, effectiveStatus(booking, now)));
  }

  async get(customerId: number, id: number) {
    const now = await databaseNow(this.database);
    const booking = await this.ownedBooking(this.database, customerId, id);
    return bookingView(booking, effectiveStatus(booking, now));
  }

  confirm(customerId: number, id: number, key?: string) {
    return runBookingRequest(
      this.database, customerId, 'CONFIRM', key, { bookingId: id },
      async () => (await this.ownedBooking(this.database, customerId, id)).equipmentTypeId,
      (transaction) => this.changeCustomerBooking(transaction, customerId, id, 'CONFIRMED'),
    );
  }

  async cancel(customerId: number, id: number) {
    const { equipmentTypeId } = await this.ownedBooking(this.database, customerId, id);
    const outcome = await withEquipmentLock(this.database, equipmentTypeId, (transaction) =>
      this.changeCustomerBooking(transaction, customerId, id, 'CANCELLED'));
    return bookingResult(outcome);
  }

  private async changeCustomerBooking(
    transaction: Prisma.TransactionClient,
    customerId: number,
    id: number,
    next: 'CONFIRMED' | 'CANCELLED',
  ) {
    const booking = await this.ownedBooking(transaction, customerId, id);
    const now = await databaseNow(transaction);
    if (await expireIfDue(transaction, booking, now) || booking.status === 'EXPIRED') {
      return { conflict: 'This hold has expired. Check availability to start a new hold.' };
    }
    if (!canTransition(booking.status, next)) {
      return { conflict: `A ${booking.status.toLowerCase().replace('_', ' ')} booking cannot be ${next.toLowerCase()}.` };
    }

    await transitionBooking(transaction, booking, next, customerId, now);
    return { booking: bookingView(booking, next) };
  }

  private async ownedBooking(database: Prisma.TransactionClient, customerId: number, id: number) {
    const booking = await database.booking.findFirst({ where: { id, customerId }, include: details });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }
}
