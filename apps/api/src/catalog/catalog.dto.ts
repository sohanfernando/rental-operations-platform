import { ApiProperty, PartialType } from '@nestjs/swagger';
import { DateRangeDto } from '../bookings/bookings.dto';
import { EquipmentCategory } from '../generated/prisma/client';

export class CatalogQuery extends PartialType(DateRangeDto, { skipNullProperties: false }) {}

class EquipmentImageResponse {
  @ApiProperty()
  id!: number;
}

export class EquipmentResponse {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: EquipmentCategory })
  category!: EquipmentCategory;

  @ApiProperty({ type: Number, nullable: true, description: 'Daily rate per unit in LKR cents.' })
  dailyRateMinor!: number | null;

  @ApiProperty({ type: [EquipmentImageResponse] })
  images!: EquipmentImageResponse[];
}

export class CatalogEquipmentResponse extends EquipmentResponse {
  @ApiProperty({ type: Number, nullable: true, description: 'Available units for the supplied date range.' })
  availableUnits!: number | null;
}
