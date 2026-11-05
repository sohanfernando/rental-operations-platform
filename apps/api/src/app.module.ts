import { Global, Module, type DynamicModule } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { CatalogModule } from './catalog/catalog.module';
import { ContactModule } from './contact/contact.module';
import { APP_ENV, type AppEnvironment } from './config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StaffBookingsModule } from './staff/staff-bookings.module';

@Global()
@Module({})
class EnvironmentModule {
  static configure(environment: AppEnvironment): DynamicModule {
    return {
      module: EnvironmentModule,
      providers: [{ provide: APP_ENV, useValue: environment }],
      exports: [APP_ENV],
    };
  }
}

@Module({
  imports: [
    DatabaseModule, HealthModule, AuthModule, CatalogModule, InventoryModule, BookingsModule,
    StaffBookingsModule, NotificationsModule, ContactModule,
  ],
})
export class AppModule {
  static configure(environment: AppEnvironment): DynamicModule {
    return { module: AppModule, imports: [EnvironmentModule.configure(environment)] };
  }
}
