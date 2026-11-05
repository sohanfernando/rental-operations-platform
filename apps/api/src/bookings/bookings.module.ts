import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExpiryQueue } from '../jobs/expiry-queue';
import { AvailabilityController, BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AuthModule],
  controllers: [AvailabilityController, BookingsController],
  providers: [BookingsService, ExpiryQueue],
})
export class BookingsModule {}
