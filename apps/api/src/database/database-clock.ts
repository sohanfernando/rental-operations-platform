import { type Prisma } from '../generated/prisma/client';

export async function databaseNow(database: Pick<Prisma.TransactionClient, '$queryRaw'>) {
  const [row] = await database.$queryRaw<{ utcNow: Date }[]>`
    SELECT UTC_TIMESTAMP(3) AS utcNow
  `;
  return row.utcNow;
}
