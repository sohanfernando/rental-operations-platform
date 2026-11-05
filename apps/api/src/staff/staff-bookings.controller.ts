import { Controller, Get, Header, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type UserResponse } from '../auth/auth.dto';
import { Actor, SessionGuard, StaffGuard, type SessionRequest } from '../auth/session';
import { BookingIdParams } from '../bookings/bookings.dto';
import { StaffBookingDetail, StaffDashboard, StaffDashboardQuery } from './staff-bookings.dto';
import { StaffBookingsService } from './staff-bookings.service';

@ApiTags('Staff bookings')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Missing, expired, or revoked session.' })
@ApiForbiddenResponse({ description: 'Staff access or same-origin request required.' })
@UseGuards(SessionGuard, StaffGuard)
@Controller('staff/bookings')
export class StaffBookingsController {
  constructor(private readonly staffBookings: StaffBookingsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: StaffDashboard })
  @ApiBadRequestResponse({ description: 'Invalid history cursor.' })
  dashboard(@Query() query: StaffDashboardQuery) {
    return this.staffBookings.dashboard(query.beforeId);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: StaffBookingDetail })
  @ApiBadRequestResponse({ description: 'Invalid booking ID.' })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  detail(@Param() params: BookingIdParams) {
    return this.staffBookings.detail(params.id);
  }

  @Post(':id/pickup')
  @HttpCode(204)
  @ApiParam({ name: 'id', type: Number })
  @ApiNoContentResponse({ description: 'Recorded handover for all allocated units.' })
  @ApiBadRequestResponse({ description: 'Invalid booking ID.' })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  @ApiConflictResponse({ description: 'Invalid status, pickup window, or an allocated unit is unavailable.' })
  pickup(@Param() params: BookingIdParams, @Actor() actor: UserResponse, @Req() request: SessionRequest) {
    return this.staffBookings.record(params.id, actor.id, 'PICKED_UP', request.requestId);
  }

  @Post(':id/return')
  @HttpCode(204)
  @ApiParam({ name: 'id', type: Number })
  @ApiNoContentResponse({ description: 'Recorded return for all allocated units.' })
  @ApiBadRequestResponse({ description: 'Invalid booking ID.' })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  @ApiConflictResponse({ description: 'Booking has no open pickup.' })
  return(@Param() params: BookingIdParams, @Actor() actor: UserResponse, @Req() request: SessionRequest) {
    return this.staffBookings.record(params.id, actor.id, 'RETURNED', request.requestId);
  }
}
