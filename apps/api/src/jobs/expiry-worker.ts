import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { expireBooking } from '../bookings/booking-state';
import { type AppEnvironment } from '../config';
import { databaseNow } from '../database/database-clock';
import { type PrismaClient } from '../generated/prisma/client';
import {
  type ExpiryJobData, expiryJob, expiryQueueName, jobOptions, reconcileJob, reconcileScheduler,
} from './expiry-queue';

type WorkerConfig = Pick<AppEnvironment, 'REDIS_URL' | 'JOB_QUEUE_PREFIX' | 'RECONCILE_SECONDS'>;
const batchSize = 100;

export function startExpiryWorker(database: PrismaClient, config: WorkerConfig) {
  const logger = new Logger('ExpiryWorker');
  const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  const options = { connection, prefix: config.JOB_QUEUE_PREFIX };
  const queue = new Queue<ExpiryJobData>(expiryQueueName, options);
  let closing = false;

  const worker = new Worker<ExpiryJobData>(expiryQueueName, async (job) => {
    if (job.name === expiryJob) {
      const { bookingId, requestId } = job.data;
      if (typeof bookingId !== 'number' || !Number.isSafeInteger(bookingId) || bookingId < 1) {
        throw new Error('Invalid expiry booking ID.');
      }
      const expired = await expireBooking(database, bookingId);
      logger.log({ event: 'hold_expiry_processed', bookingId, requestId, jobId: job.id, expired });
      return expired;
    }
    if (job.name !== reconcileJob) throw new Error('Unknown expiry job.');

    const now = await databaseNow(database);
    const due = await database.booking.findMany({
      where: { status: 'HELD', holdExpiresAt: { lte: now } },
      orderBy: [{ holdExpiresAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
      select: { id: true },
    });
    let expired = 0;
    let failures = 0;
    for (const { id: bookingId } of due) {
      try {
        if (await expireBooking(database, bookingId)) {
          expired++;
          logger.log({ event: 'hold_reconciled', jobId: job.id, bookingId });
        }
      } catch (error) {
        failures++;
        logger.warn({ event: 'hold_reconcile_failed', jobId: job.id, bookingId, error: errorName(error) });
      }
    }
    logger.log({ event: 'hold_reconcile_completed', jobId: job.id, scanned: due.length, expired, failures });
    if (failures) throw new Error('One or more holds could not be reconciled.');
    return expired;
  }, options);

  function registerScheduler() {
    if (closing) return;
    void queue.upsertJobScheduler(
      reconcileScheduler,
      { every: config.RECONCILE_SECONDS * 1000 },
      { name: reconcileJob, data: {}, opts: jobOptions },
    ).catch((error: unknown) => {
      logger.error({ event: 'hold_reconcile_scheduler_failed', error: errorName(error) });
    });
  }
  connection.on('ready', registerScheduler);
  if (connection.status === 'ready') registerScheduler();

  queue.on('error', (error) => {
    logger.warn({ event: 'expiry_scheduler_redis_error', error: errorName(error) });
  });
  worker.on('error', (error) => {
    logger.warn({ event: 'expiry_worker_error', error: errorName(error) });
  });
  worker.on('failed', (job, error) => {
    logger.warn({
      event: 'expiry_job_failed', jobId: job?.id, bookingId: job?.data.bookingId,
      requestId: job?.data.requestId, error: errorName(error),
    });
  });

  return {
    worker,
    async close() {
      closing = true;
      connection.off('ready', registerScheduler);
      try {
        await worker.close();
      } finally {
        try {
          await queue.close();
        } finally {
          connection.disconnect();
        }
      }
    },
  };
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : 'UnknownError';
}
