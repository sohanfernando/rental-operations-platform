import { Global, Module } from '@nestjs/common';
import { type OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { createDatabase } from './database';
import { APP_ENV, type AppEnvironment } from '../config';

@Global()
@Module({
  providers: [{
    provide: PrismaClient,
    inject: [APP_ENV],
    useFactory(environment: AppEnvironment): PrismaClient & OnApplicationShutdown {
      const database = createDatabase(environment.DATABASE_URL);
      return Object.assign(database, {
        onApplicationShutdown: () => database.$disconnect(),
      });
    },
  }],
  exports: [PrismaClient],
})
export class DatabaseModule {}
