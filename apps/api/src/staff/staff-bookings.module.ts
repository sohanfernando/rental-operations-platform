import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffBookingsController } from './staff-bookings.controller';
import { StaffBookingsService } from './staff-bookings.service';

@Module({
  imports: [AuthModule],
  controllers: [StaffBookingsController],
  providers: [StaffBookingsService],
})
export class StaffBookingsModule {}
