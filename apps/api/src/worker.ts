import { ConsoleLogger, Logger } from '@nestjs/common';
import { loadEnvironment } from './config';
import { createDatabase } from './database/database';
import { startExpiryWorker } from './jobs/expiry-worker';

Logger.overrideLogger(new ConsoleLogger({ json: true }));
const logger = new Logger('Worker');

function bootstrap() {
  const environment = loadEnvironment();
  const database = createDatabase(environment.DATABASE_URL);
  const expiry = startExpiryWorker(database, environment);
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await expiry.close();
    } finally {
      await database.$disconnect();
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown().catch(() => {
        logger.error({ event: 'worker_shutdown_failed' });
        process.exitCode = 1;
      });
    });
  }

  void expiry.worker.waitUntilReady().then(() => {
    if (!shuttingDown) logger.log({ event: 'expiry_worker_ready' });
  }).catch(() => {
    if (!shuttingDown) logger.warn({ event: 'expiry_worker_not_ready' });
  });
}

try {
  bootstrap();
} catch (error) {
  logger.error({ event: 'worker_start_failed', error: error instanceof Error ? error.name : 'UnknownError' });
  process.exitCode = 1;
}
