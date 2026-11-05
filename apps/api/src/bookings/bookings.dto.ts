import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, Matches, Max, Min } from 'class-validator';
import { BookingStatus } from '../generated/prisma/client';
import { maximumQuantity } from './booking-rules';

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
}

export class BookingResponse {
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

export class AvailabilityResponse {
  @ApiProperty()
  availableUnits!: number;
}
