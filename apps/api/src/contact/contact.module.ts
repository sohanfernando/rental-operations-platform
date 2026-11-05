import { Body, Controller, Get, Header, HttpCode, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNoContentResponse, ApiOkResponse, ApiProperty, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard, StaffGuard } from '../auth/session';
import { PrismaClient } from '../generated/prisma/client';

class ContactInput {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(10, 2000)
  message!: string;
}

class ContactMessageResponse extends ContactInput {
  @ApiProperty()
  id!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

@Injectable()
class ContactService {
  constructor(private readonly database: PrismaClient) {}

  async submit(input: ContactInput) {
    await this.database.contactMessage.create({ data: input });
  }

  inbox() {
    return this.database.contactMessage.findMany({ orderBy: { id: 'desc' }, take: 50 });
  }
}

@ApiTags('Contact')
@Controller('contact')
class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiNoContentResponse({ description: 'Message added to the staff inbox.' })
  @ApiBadRequestResponse({ description: 'Invalid contact fields.' })
  @ApiForbiddenResponse({ description: 'Same-origin request required.' })
  @ApiResponse({ status: 429, description: 'Too many contact submissions.' })
  submit(@Body() input: ContactInput) {
    return this.contact.submit(input);
  }
}

@ApiTags('Contact')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Sign-in required.' })
@ApiForbiddenResponse({ description: 'Staff access required.' })
@UseGuards(SessionGuard, StaffGuard)
@Controller('staff/contact')
class ContactInboxController {
  constructor(private readonly contact: ContactService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [ContactMessageResponse] })
  inbox() {
    return this.contact.inbox();
  }
}

@Module({ imports: [AuthModule], controllers: [ContactController, ContactInboxController], providers: [ContactService] })
export class ContactModule {}
