import { ConsoleLogger } from '@nestjs/common';
import { createApp } from './app';
import { loadEnvironment } from './config';

async function bootstrap() {
  const environment = loadEnvironment();
  const app = await createApp(environment, { logger: new ConsoleLogger({ json: true }) });
  app.enableShutdownHooks();
  await app.listen(environment.API_PORT, '127.0.0.1');
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'API startup failed.');
  process.exitCode = 1;
});
