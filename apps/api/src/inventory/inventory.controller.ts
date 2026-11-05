import {
  Body, Controller, Delete, Get, Header, HttpCode, Param, ParseFilePipeBuilder, ParseIntPipe, Patch, Post,
  UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiConsumes, ApiCookieAuth, ApiCreatedResponse,
  ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiResponse, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SessionGuard, StaffGuard } from '../auth/session';
import { EquipmentResponse } from '../catalog/catalog.module';
import {
  CreateEquipmentDto, CreateUnitDto, InventoryEquipmentResponse, UnitResponse,
  UpdateEquipmentDto, UpdateUnitDto,
} from './inventory.dto';
import { InventoryService, maxEquipmentImages } from './inventory.service';

const maxImageBytes = 2 * 1024 * 1024;
const imageValidation = new ParseFilePipeBuilder()
  .addFileTypeValidator({
    fileType: /^image\/(jpeg|png|webp)$/,
    overrideMimeType: true,
    errorMessage: 'Upload a JPEG, PNG, or WebP image.',
  })
  .build();

@ApiTags('Staff inventory')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Missing, expired, or revoked session.' })
@ApiForbiddenResponse({ description: 'Staff access or same-origin request required.' })
@UseGuards(SessionGuard, StaffGuard)
@Controller('staff/equipment-types')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [InventoryEquipmentResponse] })
  list() {
    return this.inventory.list();
  }

  @Post()
  @ApiCreatedResponse({ type: EquipmentResponse })
  @ApiBadRequestResponse({ description: 'Invalid equipment type fields.' })
  @ApiConflictResponse({ description: 'The equipment name already exists.' })
  createType(@Body() input: CreateEquipmentDto) {
    return this.inventory.createType(input);
  }

  @Patch(':typeId')
  @ApiOkResponse({ type: EquipmentResponse })
  @ApiBadRequestResponse({ description: 'Invalid equipment type fields or ID.' })
  @ApiNotFoundResponse({ description: 'Equipment type not found.' })
  @ApiConflictResponse({ description: 'The equipment name already exists.' })
  updateType(@Param('typeId', ParseIntPipe) typeId: number, @Body() input: UpdateEquipmentDto) {
    return this.inventory.updateType(typeId, input);
  }

  @Delete(':typeId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Removed the equipment type.' })
  @ApiBadRequestResponse({ description: 'Invalid equipment type ID.' })
  @ApiNotFoundResponse({ description: 'Equipment type not found.' })
  @ApiConflictResponse({ description: 'Equipment units or booking history reference this type.' })
  deleteType(@Param('typeId', ParseIntPipe) typeId: number) {
    return this.inventory.deleteType(typeId);
  }

  @Post(':typeId/images')
  @HttpCode(204)
  @UseInterceptors(FilesInterceptor('images', maxEquipmentImages, { limits: { fileSize: maxImageBytes, fields: 0 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['images'], properties: {
    images: { type: 'array', maxItems: maxEquipmentImages, items: { type: 'string', format: 'binary' } },
  } } })
  @ApiNoContentResponse({ description: 'Images added to the equipment gallery.' })
  @ApiBadRequestResponse({ description: 'Invalid equipment type ID or image format.' })
  @ApiConflictResponse({ description: 'The gallery is full.' })
  @ApiNotFoundResponse({ description: 'Equipment type not found.' })
  @ApiResponse({ status: 413, description: 'An image exceeds 2 MB.' })
  addImages(
    @Param('typeId', ParseIntPipe) typeId: number,
    @UploadedFiles(imageValidation) files: { buffer: Buffer; mimetype: string }[],
  ) {
    return this.inventory.addImages(typeId, files);
  }

  @Delete(':typeId/images/:imageId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Removed the image from the gallery.' })
  @ApiNotFoundResponse({ description: 'Equipment type or image not found.' })
  deleteImage(@Param('typeId', ParseIntPipe) typeId: number, @Param('imageId', ParseIntPipe) imageId: number) {
    return this.inventory.deleteImage(typeId, imageId);
  }

  @Post(':typeId/units')
  @ApiCreatedResponse({ type: UnitResponse })
  @ApiBadRequestResponse({ description: 'Invalid equipment unit fields or type ID.' })
  @ApiNotFoundResponse({ description: 'Equipment type not found.' })
  @ApiConflictResponse({ description: 'The asset tag already exists.' })
  createUnit(@Param('typeId', ParseIntPipe) typeId: number, @Body() input: CreateUnitDto) {
    return this.inventory.createUnit(typeId, input);
  }

  @Patch(':typeId/units/:unitId')
  @ApiOkResponse({ type: UnitResponse })
  @ApiBadRequestResponse({ description: 'Invalid equipment unit fields or ID.' })
  @ApiNotFoundResponse({ description: 'Equipment type or unit not found.' })
  @ApiConflictResponse({ description: 'Duplicate asset tag or active booking prevents this change.' })
  updateUnit(
    @Param('typeId', ParseIntPipe) typeId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() input: UpdateUnitDto,
  ) {
    return this.inventory.updateUnit(typeId, unitId, input);
  }

  @Delete(':typeId/units/:unitId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Removed the equipment unit.' })
  @ApiBadRequestResponse({ description: 'Invalid equipment type or unit ID.' })
  @ApiNotFoundResponse({ description: 'Equipment type or unit not found.' })
  @ApiConflictResponse({ description: 'Booking history references this unit.' })
  deleteUnit(@Param('typeId', ParseIntPipe) typeId: number, @Param('unitId', ParseIntPipe) unitId: number) {
    return this.inventory.deleteUnit(typeId, unitId);
  }
}
