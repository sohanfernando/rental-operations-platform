import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { maximumDailyRateMinor } from '../bookings/rental-price';
import { EquipmentResponse } from '../catalog/catalog.dto';
import { EquipmentCategory, UnitStatus } from '../generated/prisma/client';

export class CreateEquipmentDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 1000)
  description!: string;

  @ApiPropertyOptional({ enum: EquipmentCategory, default: EquipmentCategory.OTHER })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(EquipmentCategory)
  category?: EquipmentCategory;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: maximumDailyRateMinor, description: 'Daily rate per unit in LKR cents.' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  @Max(maximumDailyRateMinor)
  dailyRateMinor?: number | null;
}

export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto, { skipNullProperties: false }) {}

export class CreateUnitDto {
  @ApiProperty({ pattern: '^[A-Z0-9][A-Z0-9-]{0,63}$', example: 'CAM-001' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,63}$/)
  assetTag!: string;

  @ApiPropertyOptional({ enum: UnitStatus, default: UnitStatus.IN_SERVICE })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(UnitStatus)
  status?: UnitStatus;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto, { skipNullProperties: false }) {}

export class UnitResponse {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  equipmentTypeId!: number;

  @ApiProperty()
  assetTag!: string;

  @ApiProperty({ enum: UnitStatus })
  status!: UnitStatus;
}

export class InventoryEquipmentResponse extends EquipmentResponse {
  @ApiProperty({ type: [UnitResponse] })
  units!: UnitResponse[];
}
