import { Controller, Get, Header, Injectable, Module, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiProperty, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { type UserResponse } from '../auth/auth.dto';
import { AuthModule } from '../auth/auth.module';
import { Actor, CustomerGuard, SessionGuard } from '../auth/session';
import { PrismaClient } from '../generated/prisma/client';

class NotificationResponse {
  @ApiProperty()
  eventId!: number;

  @ApiProperty()
  bookingId!: number;

  @ApiProperty()
  message!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;
}

@Injectable()
class NotificationsService {
  constructor(private readonly database: PrismaClient) {}

  async list(customerId: number): Promise<NotificationResponse[]> {
    const notifications = await this.database.notification.findMany({
      where: { event: { booking: { customerId } } },
      orderBy: [{ event: { occurredAt: 'desc' } }, { eventId: 'desc' }],
      take: 50,
      include: { event: { include: { booking: { include: { equipmentType: { select: { name: true } } } } } } },
    });
    return notifications.map(({ event }) => ({
      eventId: event.id,
      bookingId: event.bookingId,
      message: event.toStatus === 'CONFIRMED'
        ? `Your ${event.booking.equipmentType.name} reservation was confirmed.`
        : `Your ${event.booking.equipmentType.name} hold expired.`,
      occurredAt: event.occurredAt.toISOString(),
    }));
  }
}

@ApiTags('Notifications')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Missing, expired, or revoked session.' })
@ApiForbiddenResponse({ description: 'Customer access required.' })
@UseGuards(SessionGuard, CustomerGuard)
@Controller('notifications')
class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [NotificationResponse] })
  list(@Actor() actor: UserResponse) {
    return this.notifications.list(actor.id);
  }
}

@Module({ imports: [AuthModule], controllers: [NotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}
