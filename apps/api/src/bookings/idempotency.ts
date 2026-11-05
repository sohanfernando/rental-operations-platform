import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { withEquipmentLock } from '../database/inventory-lock';
import { Prisma, type BookingOperation, type PrismaClient } from '../generated/prisma/client';
import { type BookingResponse } from './bookings.dto';

type Outcome = { booking: Readonly<BookingResponse> } | { conflict: string };

class ConcurrentRequest extends Error {}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function readOutcome(stored: { fingerprint: string; outcome: Prisma.JsonValue }, fingerprint: string) {
  if (stored.fingerprint !== fingerprint) {
    throw new ConflictException('This Idempotency-Key was already used with different input.');
  }
  return stored.outcome as Outcome;
}

export function bookingResult(outcome: Outcome) {
  if ('conflict' in outcome) throw new ConflictException(outcome.conflict);
  return outcome.booking;
}

export async function runBookingRequest(
  database: PrismaClient,
  userId: number,
  operation: BookingOperation,
  key: string | undefined,
  payload: object,
  findTypeId: () => number | Promise<number>,
  execute: (transaction: Prisma.TransactionClient) => Promise<Outcome>,
) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
    throw new BadRequestException('Provide an Idempotency-Key of 1–128 letters, digits, dots, colons, underscores or hyphens.');
  }
  const fingerprint = digest(JSON.stringify(payload));
  const scope = { userId, operation, keyHash: digest(key) };
  const where = { userId_operation_keyHash: scope };

  // A stored response also survives later changes to the booking or its equipment.
  const previous = await database.bookingRequest.findUnique({ where });
  if (previous) return bookingResult(readOutcome(previous, fingerprint));

  let outcome: Outcome;
  try {
    outcome = await withEquipmentLock(database, await findTypeId(), async (transaction) => {
      const stored = await transaction.bookingRequest.findUnique({ where });
      if (stored) return readOutcome(stored, fingerprint);

      const result = await execute(transaction);
      try {
        await transaction.bookingRequest.create({ data: { ...scope, fingerprint, outcome: result } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // Different equipment types have different locks. Losing the unique-key
          // race must roll back this entire transaction before replaying the winner.
          throw new ConcurrentRequest();
        }
        throw error;
      }
      return result;
    });
  } catch (error) {
    if (!(error instanceof ConcurrentRequest)) throw error;
    const winner = await database.bookingRequest.findUniqueOrThrow({ where });
    outcome = readOutcome(winner, fingerprint);
  }
  return bookingResult(outcome);
}
