import { Controller, Get, Header, Module, NotFoundException, Param, ParseIntPipe, Query, StreamableFile } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CatalogEquipmentResponse, CatalogQuery } from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('Catalog')
@Controller('catalog')
class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('equipment-types')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [CatalogEquipmentResponse] })
  @ApiBadRequestResponse({ description: 'Invalid rental date range.' })
  list(@Query() input: CatalogQuery) {
    return this.catalog.list(input);
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
