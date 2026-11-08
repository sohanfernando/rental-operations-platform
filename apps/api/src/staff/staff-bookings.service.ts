import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { businessToday, calendarDate, canTransition, effectiveStatus } from '../bookings/booking-rules';
import { transitionBooking } from '../bookings/booking-state';
import { databaseNow } from '../database/database-clock';
import { withEquipmentLock } from '../database/inventory-lock';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { type StaffBooking, type StaffBookingDetail, type StaffDashboard } from './staff-bookings.dto';

const stockDetails = {
  equipmentType: { select: { name: true } },
  customer: { select: { email: true } },
  allocations: {
    orderBy: { unitId: 'asc' },
    include: { unit: { select: { assetTag: true, status: true } } },
  },
} satisfies Prisma.BookingInclude;

type StockBooking = Prisma.BookingGetPayload<{ include: typeof stockDetails }>;
const historyPageSize = 30;

function pickupWindowOpen(booking: StockBooking, today: Date) {
  return booking.startDate <= today && today < booking.endDate;
}

function view(booking: StockBooking, now: Date, today: Date, open: ReadonlyMap<number, number>): StaffBooking {
  const status = effectiveStatus(booking, now);
  const conflicts = [];
  if (status === 'CONFIRMED') {
    for (const allocation of booking.allocations) {
      const openBookingId = open.get(allocation.unitId);
      if (openBookingId !== undefined) conflicts.push({ assetTag: allocation.unit.assetTag, openBookingId });
    }
  }

  return {
    id: booking.id,
    equipmentName: booking.equipmentType.name,
    customerEmail: booking.customer.email,
    startDate: calendarDate(booking.startDate),
    endDate: calendarDate(booking.endDate),
    dailyRateMinor: booking.dailyRateMinor,
    totalMinor: booking.totalMinor,
    status,
    assetTags: booking.allocations.map(({ unit }) => unit.assetTag),
    overdue: status === 'PICKED_UP' && booking.endDate <= today,
    pickupWindowOpen: status === 'CONFIRMED' && pickupWindowOpen(booking, today),
    conflicts,
  };
}

@Injectable()
export class StaffBookingsService {
  private readonly logger = new Logger(StaffBookingsService.name);

  constructor(private readonly database: PrismaClient) {}

  async dashboard(beforeId?: number): Promise<StaffDashboard> {
    const { now, pickups, openRentals, history } = await this.database.$transaction(async (transaction) => {
      const now = await databaseNow(transaction);
      const pickups = await transaction.booking.findMany({
        where: { status: 'CONFIRMED' },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        include: stockDetails,
      });
      const openRentals = await transaction.booking.findMany({
        where: { status: 'PICKED_UP' },
        orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
        include: stockDetails,
      });
      const history = await transaction.booking.findMany({
        where: beforeId === undefined ? undefined : { id: { lt: beforeId } },
        orderBy: { id: 'desc' },
        take: historyPageSize + 1,
        include: stockDetails,
      });
      return { now, pickups, openRentals, history };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const today = businessToday(now);
    const recentBookings = history.slice(0, historyPageSize);
    const open = new Map(openRentals.flatMap((booking) =>
      booking.allocations.map(({ unitId }) => [unitId, booking.id] as const)));
    return {
      businessDate: calendarDate(today),
      pickups: pickups.map((booking) => view(booking, now, today, open)),
      openRentals: openRentals.map((booking) => view(booking, now, today, open)),
      recentBookings: recentBookings.map((booking) => view(booking, now, today, open)),
      nextBeforeId: history.length > historyPageSize ? recentBookings[historyPageSize - 1].id : null,
    };
  }

  async detail(id: number): Promise<StaffBookingDetail> {
    const booking = await this.database.booking.findUnique({
      where: { id },
      include: {
        ...stockDetails,
        events: { orderBy: { id: 'asc' }, include: { actor: { select: { email: true } } } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    const now = await databaseNow(this.database);
    const blockers = booking.status === 'CONFIRMED' ? await this.openAllocations(this.database, booking) : [];
    return {
      ...view(booking, now, businessToday(now), new Map(blockers.map(({ unitId, bookingId }) => [unitId, bookingId]))),
      events: booking.events.map(({ id, fromStatus, toStatus, occurredAt, actor }) => ({
        id, fromStatus, toStatus, occurredAt: occurredAt.toISOString(), actorEmail: actor?.email ?? null,
      })),
    };
  }

  async record(id: number, actorId: number, next: 'PICKED_UP' | 'RETURNED', requestId?: string) {
    const target = await this.database.booking.findUnique({
      where: { id }, select: { equipmentTypeId: true },
    });
    if (!target) throw new NotFoundException('Booking not found.');

    await withEquipmentLock(this.database, target.equipmentTypeId, async (transaction) => {
      const booking = await transaction.booking.findUniqueOrThrow({ where: { id }, include: stockDetails });
      if (!canTransition(booking.status, next)) {
        throw new ConflictException(next === 'PICKED_UP'
          ? 'Only confirmed bookings can be picked up.'
          : 'Only open pickups can be returned.');
      }
      const now = await databaseNow(transaction);
      if (next === 'PICKED_UP') {
        const blockers = await this.openAllocations(transaction, booking);
        if (blockers.length) {
          throw new ConflictException('An allocated unit is still with another customer. Record its return first.');
        }
        if (!pickupWindowOpen(booking, businessToday(now))) {
          throw new ConflictException('Pickup is allowed from the start date until the end date in Asia/Colombo.');
        }
        if (booking.allocations.some(({ unit }) => unit.status !== 'IN_SERVICE')) {
          throw new ConflictException('An allocated unit is out of service.');
        }
      }
      await transitionBooking(transaction, booking, next, actorId, now);
    });
    this.logger.log({ event: 'staff_booking_transition', bookingId: id, requestId, status: next });
  }

  private openAllocations(database: Prisma.TransactionClient, booking: StockBooking) {
    return database.bookingAllocation.findMany({
      where: {
        unitId: { in: booking.allocations.map(({ unitId }) => unitId) },
        booking: { status: 'PICKED_UP', equipmentTypeId: booking.equipmentTypeId },
      },
      select: { unitId: true, bookingId: true },
    });
  }
}
