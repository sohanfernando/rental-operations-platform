import { NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '../generated/prisma/client';

export function withEquipmentLock<T>(
  database: PrismaClient,
  equipmentTypeId: number,
  mutate: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<{ id: number }[]>`
      SELECT id FROM equipment_types WHERE id = ${equipmentTypeId} FOR UPDATE
    `;
    if (rows.length === 0) throw new NotFoundException('Equipment type not found.');
    return mutate(transaction);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
