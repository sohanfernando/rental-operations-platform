import {
  Body, Controller, Get, Header, Headers, HttpCode, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse,
  ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type UserResponse } from '../auth/auth.dto';
import { Actor, CustomerGuard, SessionGuard, type SessionRequest } from '../auth/session';
import { AvailabilityQuery, AvailabilityResponse, BookingIdParams, BookingResponse, CreateHoldDto } from './bookings.dto';
import { BookingsService } from './bookings.service';

const idempotencyHeader = {
  name: 'Idempotency-Key',
  required: true,
  description: 'Reuse the same key when retrying the same request.',
};

@ApiTags('Availability')
@Controller('catalog')
export class AvailabilityController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('availability')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Preview availability for a calendar date range' })
  @ApiOkResponse({ type: AvailabilityResponse })
  @ApiBadRequestResponse({ description: 'Invalid equipment ID or date range.' })
  @ApiNotFoundResponse({ description: 'Equipment type not found.' })
  preview(@Query() input: AvailabilityQuery) {
    return this.bookings.availability(input);
  }
}

@ApiTags('Customer bookings')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Missing, expired, or revoked session.' })
@ApiForbiddenResponse({ description: 'Customer access or same-origin request required.' })
@UseGuards(SessionGuard, CustomerGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('holds')
  @ApiHeader(idempotencyHeader)
  @ApiCreatedResponse({ type: BookingResponse })
  @ApiBadRequestResponse({ description: 'Invalid dates, quantity, equipment ID, or idempotency key.' })
  @ApiNotFoundResponse({ description: 'Equipment type not found.' })
  @ApiConflictResponse({ description: 'Insufficient units or key reused with different input.' })
  hold(
    @Actor() actor: UserResponse, @Body() input: CreateHoldDto,
    @Req() request: SessionRequest, @Headers('idempotency-key') key?: string,
  ) {
    return this.bookings.createHold(actor.id, input, key, request.requestId);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [BookingResponse] })
  list(@Actor() actor: UserResponse) {
    return this.bookings.list(actor.id);
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: Number })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BookingResponse })
  @ApiBadRequestResponse({ description: 'Invalid booking ID.' })
  @ApiNotFoundResponse({ description: 'Booking not found for the signed-in customer.' })
  get(@Actor() actor: UserResponse, @Param() params: BookingIdParams) {
    return this.bookings.get(actor.id, params.id);
  }

  @Post(':id/confirm')
  @ApiParam({ name: 'id', type: Number })
  @HttpCode(200)
  @ApiHeader(idempotencyHeader)
  @ApiOkResponse({ type: BookingResponse })
  @ApiBadRequestResponse({ description: 'Invalid booking ID or idempotency key.' })
  @ApiNotFoundResponse({ description: 'Booking not found for the signed-in customer.' })
  @ApiConflictResponse({ description: 'Ineligible or expired booking, or key reused with different input.' })
  confirm(@Actor() actor: UserResponse, @Param() params: BookingIdParams, @Headers('idempotency-key') key?: string) {
    return this.bookings.confirm(actor.id, params.id, key);
  }

  @Post(':id/cancel')
  @ApiParam({ name: 'id', type: Number })
  @HttpCode(200)
  @ApiOkResponse({ type: BookingResponse })
  @ApiBadRequestResponse({ description: 'Invalid booking ID.' })
  @ApiNotFoundResponse({ description: 'Booking not found for the signed-in customer.' })
  @ApiConflictResponse({ description: 'This booking is ineligible for cancellation.' })
  cancel(@Actor() actor: UserResponse, @Param() params: BookingIdParams) {
    return this.bookings.cancel(actor.id, params.id);
  }
}
