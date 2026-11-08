import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { eligibleUnits, rentalRange } from '../bookings/booking-rules';
import { databaseNow } from '../database/database-clock';
import { PrismaClient, type Prisma } from '../generated/prisma/client';
import { type CatalogEquipmentResponse, type CatalogQuery } from './catalog.dto';

export const equipmentFields = {
  id: true,
  name: true,
  description: true,
  category: true,
  dailyRateMinor: true,
  images: { select: { id: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.EquipmentTypeSelect;

@Injectable()
export class CatalogService {
  constructor(private readonly database: PrismaClient) {}

  async list({ startDate, endDate }: CatalogQuery): Promise<CatalogEquipmentResponse[]> {
    if (Boolean(startDate) !== Boolean(endDate)) {
      throw new BadRequestException('Provide both a start date and an end date.');
    }
    let units: Prisma.EquipmentUnitWhereInput | undefined;
    if (startDate && endDate) {
      const now = await databaseNow(this.database);
      units = eligibleUnits(rentalRange({ startDate, endDate }, now), now);
    }
    const equipment = await this.database.equipmentType.findMany({
      select: {
        ...equipmentFields,
        _count: units && { select: { units: { where: units } } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return equipment.map(({ _count, ...item }) => ({ ...item, availableUnits: _count?.units ?? null }));
  }

  async image(id: number) {
    const image = await this.database.equipmentImage.findUnique({
      where: { id },
      select: { data: true, contentType: true },
    });
    if (!image) throw new NotFoundException('Equipment image not found.');
    return image;
  }
}
