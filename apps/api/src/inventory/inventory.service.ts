import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { activeBooking } from '../bookings/booking-rules';
import { equipmentFields } from '../catalog/catalog.service';
import { databaseNow } from '../database/database-clock';
import { withEquipmentLock } from '../database/inventory-lock';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import {
  type CreateEquipmentDto, type CreateUnitDto, type UpdateEquipmentDto, type UpdateUnitDto,
} from './inventory.dto';

export const maxEquipmentImages = 5;

@Injectable()
export class InventoryService {
  constructor(private readonly database: PrismaClient) {}

  list() {
    return this.database.equipmentType.findMany({
      select: { ...equipmentFields, units: { orderBy: { id: 'asc' } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  createType(input: CreateEquipmentDto) {
    return this.handleInventoryErrors(
      () => this.database.equipmentType.create({ data: input, select: equipmentFields }),
      'An equipment type already uses this name.',
    );
  }

  updateType(typeId: number, input: UpdateEquipmentDto) {
    return this.handleInventoryErrors(
      () => withEquipmentLock(this.database, typeId, (transaction) =>
        transaction.equipmentType.update({ where: { id: typeId }, data: input, select: equipmentFields })),
      'An equipment type already uses this name.',
    );
  }

  async addImages(typeId: number, files: { buffer: Buffer; mimetype: string }[]) {
    await withEquipmentLock(this.database, typeId, async (transaction) => {
      const existing = await transaction.equipmentImage.count({ where: { equipmentTypeId: typeId } });
      if (existing + files.length > maxEquipmentImages) {
        throw new ConflictException(`Each equipment type can have up to ${maxEquipmentImages} images.`);
      }
      await transaction.equipmentImage.createMany({
        data: files.map(({ buffer, mimetype }) => ({
          equipmentTypeId: typeId,
          contentType: mimetype,
          data: new Uint8Array(buffer),
        })),
      });
    });
  }

  async deleteImage(typeId: number, imageId: number) {
    await withEquipmentLock(this.database, typeId, async (transaction) => {
      const removed = await transaction.equipmentImage.deleteMany({
        where: { id: imageId, equipmentTypeId: typeId },
      });
      if (!removed.count) throw new NotFoundException('Equipment image not found.');
    });
  }

  async deleteType(typeId: number) {
    await this.handleInventoryErrors(
      () => withEquipmentLock(this.database, typeId, (transaction) =>
        transaction.equipmentType.delete({ where: { id: typeId } })),
    );
  }

  createUnit(typeId: number, input: CreateUnitDto) {
    return this.handleInventoryErrors(
      () => withEquipmentLock(this.database, typeId, (transaction) =>
        transaction.equipmentUnit.create({ data: { equipmentTypeId: typeId, ...input } })),
      'An equipment unit already uses this asset tag.',
    );
  }

  updateUnit(typeId: number, unitId: number, input: UpdateUnitDto) {
    return this.handleInventoryErrors(
      () => withEquipmentLock(this.database, typeId, async (transaction) => {
        if (input.status === 'OUT_OF_SERVICE') {
          const now = await databaseNow(transaction);
          const allocation = await transaction.bookingAllocation.findFirst({
            where: {
              unitId,
              booking: { equipmentTypeId: typeId, ...activeBooking(now) },
            },
            select: { unitId: true },
          });
          if (allocation) throw new ConflictException('This unit has an active hold, reservation, or pickup.');
        }
        return transaction.equipmentUnit.update({
          where: { id: unitId, equipmentTypeId: typeId },
          data: input,
        });
      }),
      'An equipment unit already uses this asset tag.',
    );
  }

  async deleteUnit(typeId: number, unitId: number) {
    await this.handleInventoryErrors(
      () => withEquipmentLock(this.database, typeId, (transaction) =>
        transaction.equipmentUnit.delete({ where: { id: unitId, equipmentTypeId: typeId } })),
    );
  }

  private async handleInventoryErrors<T>(mutate: () => Promise<T>, duplicateMessage?: string) {
    try {
      return await mutate();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      if (error.code === 'P2002') throw new ConflictException(duplicateMessage);
      if (error.code === 'P2025') throw new NotFoundException('Equipment unit not found for this type.');
      if (error.code === 'P2003') {
        throw new ConflictException('This record is linked to equipment units or booking history.');
      }
      throw error;
    }
  }
}
