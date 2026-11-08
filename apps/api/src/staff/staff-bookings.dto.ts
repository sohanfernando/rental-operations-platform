import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { RentalPriceResponse } from '../bookings/bookings.dto';
import { BookingStatus } from '../generated/prisma/client';

export class StaffDashboardQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 2147483647, description: 'Fetch history before this booking ID.' })
  @Type(() => Number)
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  beforeId?: number;
}

export class HandoverConflict {
  @ApiProperty()
  assetTag!: string;

  @ApiProperty()
  openBookingId!: number;
}

export class StaffBooking extends RentalPriceResponse {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  equipmentName!: string;

  @ApiProperty({ format: 'email' })
  customerEmail!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;

  @ApiProperty({ enum: BookingStatus })
  status!: BookingStatus;

  @ApiProperty({ type: [String] })
  assetTags!: string[];

  @ApiProperty()
  overdue!: boolean;

  @ApiProperty()
  pickupWindowOpen!: boolean;

  @ApiProperty({ type: [HandoverConflict] })
  conflicts!: HandoverConflict[];
}

export class StaffDashboard {
  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ type: [StaffBooking] })
  pickups!: StaffBooking[];

  @ApiProperty({ type: [StaffBooking] })
  openRentals!: StaffBooking[];

  @ApiProperty({ type: [StaffBooking] })
  recentBookings!: StaffBooking[];

  @ApiProperty({ type: Number, nullable: true })
  nextBeforeId!: number | null;
}

export class StaffBookingEvent {
  @ApiProperty()
  id!: number;

  @ApiProperty({ enum: BookingStatus, nullable: true })
  fromStatus!: BookingStatus | null;

  @ApiProperty({ enum: BookingStatus })
  toStatus!: BookingStatus;

  @ApiProperty({ format: 'email', nullable: true, type: String })
  actorEmail!: string | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;
}

export class StaffBookingDetail extends StaffBooking {
  @ApiProperty({ type: [StaffBookingEvent] })
  events!: StaffBookingEvent[];
}
