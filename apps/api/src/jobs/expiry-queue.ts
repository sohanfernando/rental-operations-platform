import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_ENV, type AppEnvironment } from '../config';

export const expiryQueueName = 'hold-expiry';
export const expiryJob = 'expire-hold';
export const reconcileJob = 'reconcile-holds';
export const reconcileScheduler = 'reconcile-expired';

export interface ExpiryJobData {
  bookingId?: number;
  requestId?: string;
}

export const jobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
};

@Injectable()
export class ExpiryQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(ExpiryQueue.name);
  private transport?: { queue: Queue<ExpiryJobData>; connection: Redis };

  constructor(@Inject(APP_ENV) private readonly environment: AppEnvironment) {}

  async schedule(bookingId: number, expiresAt: string, requestId?: string) {
    const jobId = `expiry-${bookingId}`;
    try {
      const queue = this.getQueue();
      await queue.add(expiryJob, { bookingId, requestId }, {
        ...jobOptions,
        jobId,
        delay: Math.max(0, Date.parse(expiresAt) - Date.now()),
      });
      this.logger.log({ event: 'hold_expiry_enqueued', bookingId, requestId, jobId });
    } catch (error) {
      this.logger.warn({
        event: 'hold_expiry_enqueue_failed', bookingId, requestId, jobId,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  async onApplicationShutdown() {
    if (this.transport) await this.closeTransport(this.transport);
  }

  private getQueue() {
    if (!this.transport || this.transport.connection.status === 'end') {
      if (this.transport) void this.closeTransport(this.transport);
      const connection = new Redis(this.environment.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        commandTimeout: 1500,
        retryStrategy: (attempt) => attempt === 1 ? 100 : null,
      });
      const queue = new Queue<ExpiryJobData>(expiryQueueName, {
        connection,
        prefix: this.environment.JOB_QUEUE_PREFIX,
      });
      // Log failed operations with their booking and request IDs instead of raw Redis errors.
      queue.on('error', () => undefined);
      this.transport = { connection, queue };
    }
    return this.transport.queue;
  }

  private async closeTransport(transport: { queue: Queue<ExpiryJobData>; connection: Redis }) {
    try {
      await transport.queue.close();
    } catch {
      this.logger.warn({ event: 'hold_expiry_queue_close_failed' });
    } finally {
      transport.connection.disconnect();
    }
  }
}
