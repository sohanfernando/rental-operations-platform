import { Controller, Get, Header, Injectable, Module, NotFoundException, Param, ParseIntPipe, StreamableFile } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiProperty, ApiTags } from '@nestjs/swagger';
import { PrismaClient, type Prisma } from '../generated/prisma/client';

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

  @ApiProperty({ type: [EquipmentImageResponse] })
  images!: EquipmentImageResponse[];
}

export const equipmentFields = {
  id: true,
  name: true,
  description: true,
  images: { select: { id: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.EquipmentTypeSelect;

@Injectable()
class CatalogService {
  constructor(private readonly database: PrismaClient) {}

  list(): Promise<EquipmentResponse[]> {
    return this.database.equipmentType.findMany({
      select: equipmentFields,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
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

@ApiTags('Catalog')
@Controller('catalog')
class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('equipment-types')
  @ApiOkResponse({ type: [EquipmentResponse] })
  list() {
    return this.catalog.list();
  }

  @Get('images/:id')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Equipment image not found.' })
  async image(@Param('id', ParseIntPipe) id: number) {
    if (id < 1 || id > 2147483647) throw new NotFoundException('Equipment image not found.');
    const image = await this.catalog.image(id);
    return new StreamableFile(Buffer.from(image.data), { type: image.contentType, length: image.data.length });
  }
}

@Module({ controllers: [CatalogController], providers: [CatalogService] })
export class CatalogModule {}
