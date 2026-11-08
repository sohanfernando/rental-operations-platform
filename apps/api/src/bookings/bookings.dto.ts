import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';
import { BookingStatus } from '../generated/prisma/client';
import { maximumQuantity } from './booking-rules';
import { maximumTotalMinor } from './rental-price';

export class BookingIdParams {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id!: number;
}

export class DateRangeDto {
  @ApiProperty({ format: 'date', description: 'First rental day in Asia/Colombo.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({ format: 'date', description: 'First day outside the rental range.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  endDate!: string;
}

export class AvailabilityQuery extends DateRangeDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  equipmentTypeId!: number;

  @ApiPropertyOptional({ minimum: 1, maximum: maximumQuantity, default: 1 })
  @Type(() => Number)
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(maximumQuantity)
  quantity?: number;
}

export class CreateHoldDto extends DateRangeDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  equipmentTypeId!: number;

  @ApiProperty({ minimum: 1, maximum: maximumQuantity })
  @IsInt()
  @Min(1)
  @Max(maximumQuantity)
  quantity!: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Last previewed total in LKR cents. Null means unpriced.' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  @Max(maximumTotalMinor)
  expectedTotalMinor?: number | null;
}

export class RentalPriceResponse {
  @ApiProperty({ type: Number, nullable: true, description: 'Daily rate per unit in LKR cents.' })
  dailyRateMinor!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Total rental price in LKR cents.' })
  totalMinor!: number | null;
}

export class BookingResponse extends RentalPriceResponse {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  equipmentTypeId!: number;

  @ApiProperty()
  equipmentName!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ enum: BookingStatus })
  status!: BookingStatus;

  @ApiProperty({ format: 'date-time' })
  holdExpiresAt!: string;
}

export class AvailabilityResponse extends RentalPriceResponse {
  @ApiProperty()
  availableUnits!: number;

  @ApiProperty()
  rentalDays!: number;
}
